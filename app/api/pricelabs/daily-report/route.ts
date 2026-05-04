import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getActiveClients, getRmPortalCredentials } from '@/lib/supabase/clients';
import { upsertBookings } from '@/lib/supabase/reports';
import { launchBrowser } from '@/lib/pricelabs/browser';
import { loginToPriceLabs } from '@/lib/pricelabs/login';
import { switchToRmClient } from '@/lib/pricelabs/rm-portal';
import { downloadBookingsFile } from '@/lib/pricelabs/download';
import { parseBookingsXlsx } from '@/lib/pricelabs/parse';

// Allow up to 5 minutes — needed for Playwright across 8 clients
export const maxDuration = 300;

interface ClientResult {
  clientId: string;
  clientName: string;
  status: 'ok' | 'error';
  bookingsFound: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  // Allow Vercel Cron (Bearer secret) OR logged-in dashboard users
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = secret && authHeader === `Bearer ${secret}`;

  if (!isCron) {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results: ClientResult[] = [];
  let clients;

  try {
    clients = await getActiveClients();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  if (!clients.length) {
    return NextResponse.json({ message: 'No active clients found', results: [] });
  }

  // Get RM portal credentials for rm_portal clients
  const rmCreds = await getRmPortalCredentials();

  // Group clients by connection type for efficient browser reuse
  const directClients = clients.filter(c => c.connection_type === 'direct');
  const rmPortalClients = clients.filter(c => c.connection_type === 'rm_portal');

  // Run direct clients — one browser session per client
  for (const client of directClients) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await loginToPriceLabs(browser, client.email, client.password);
      try {
        const buffer = await downloadBookingsFile(page);
        const bookings = parseBookingsXlsx(buffer);
        const reportDate = new Date();
        reportDate.setDate(reportDate.getDate() - 1);
        const reportDateStr = reportDate.toISOString().split('T')[0];
        await upsertBookings(client.id, reportDateStr, bookings);
        results.push({ clientId: client.id, clientName: client.client_name, status: 'ok', bookingsFound: bookings.length });
      } finally { await context.close(); }
    } catch (err) {
      results.push({ clientId: client.id, clientName: client.client_name, status: 'error', bookingsFound: 0, error: String(err) });
    } finally { await browser.close(); }
  }

  // Run RM Portal clients — single browser session, switch between clients
  if (rmPortalClients.length > 0 && rmCreds) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await loginToPriceLabs(browser, rmCreds.email, rmCreds.password);
      try {
        for (const client of rmPortalClients) {
          try {
            await switchToRmClient(page, client.client_name);
            const buffer = await downloadBookingsFile(page);
            const bookings = parseBookingsXlsx(buffer);
            const reportDate = new Date();
            reportDate.setDate(reportDate.getDate() - 1);
            const reportDateStr = reportDate.toISOString().split('T')[0];
            await upsertBookings(client.id, reportDateStr, bookings);
            results.push({ clientId: client.id, clientName: client.client_name, status: 'ok', bookingsFound: bookings.length });
          } catch (err) {
            results.push({ clientId: client.id, clientName: client.client_name, status: 'error', bookingsFound: 0, error: String(err) });
          }
        }
      } finally { await context.close(); }
    } catch (err) {
      // If RM portal login fails, mark all RM clients as error
      for (const client of rmPortalClients) {
        results.push({ clientId: client.id, clientName: client.client_name, status: 'error', bookingsFound: 0, error: `RM Portal login failed: ${String(err)}` });
      }
    } finally { await browser.close(); }
  } else if (rmPortalClients.length > 0 && !rmCreds) {
    for (const client of rmPortalClients) {
      results.push({ clientId: client.id, clientName: client.client_name, status: 'error', bookingsFound: 0, error: 'No RM Portal credentials configured' });
    }
  }

  const allOk = results.every(r => r.status === 'ok');
  return NextResponse.json(
    { success: allOk, results },
    { status: allOk ? 200 : 207 }
  );
}
