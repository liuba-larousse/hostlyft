import { NextRequest, NextResponse } from 'next/server';
import { getActiveClients } from '@/lib/supabase/clients';
import { upsertBookings } from '@/lib/supabase/reports';
import { launchBrowser } from '@/lib/pricelabs/browser';
import { loginToPriceLabs } from '@/lib/pricelabs/login';
import { downloadBookingsCsv } from '@/lib/pricelabs/download';
import { parseBookingsCsv } from '@/lib/pricelabs/parse';

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
  // Protect with CRON_SECRET (same pattern as /api/cron/marketing)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
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

  // Run clients sequentially — one browser session per client to avoid conflicts
  for (const client of clients) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await loginToPriceLabs(browser, client.email, client.password);

      try {
        const csv = await downloadBookingsCsv(page);
        const bookings = parseBookingsCsv(csv);
        const reportDate = new Date();
        reportDate.setDate(reportDate.getDate() - 1);
        const reportDateStr = reportDate.toISOString().split('T')[0];
        await upsertBookings(client.id, reportDateStr, bookings);

        results.push({
          clientId: client.id,
          clientName: client.client_name,
          status: 'ok',
          bookingsFound: bookings.length,
        });
      } finally {
        await context.close();
      }
    } catch (err) {
      results.push({
        clientId: client.id,
        clientName: client.client_name,
        status: 'error',
        bookingsFound: 0,
        error: String(err),
      });
    } finally {
      await browser.close();
    }
  }

  const allOk = results.every(r => r.status === 'ok');
  return NextResponse.json(
    { success: allOk, results },
    { status: allOk ? 200 : 207 }
  );
}
