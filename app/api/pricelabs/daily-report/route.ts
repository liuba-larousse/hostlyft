import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getActiveClients, getRmPortalCredentials } from '@/lib/supabase/clients';
import { upsertBookings } from '@/lib/supabase/reports';
import { launchBrowser } from '@/lib/pricelabs/browser';
import { loginToPriceLabs } from '@/lib/pricelabs/login';
import { switchToRmClient } from '@/lib/pricelabs/rm-portal';
import { downloadBookingsFile } from '@/lib/pricelabs/download';
import { parseBookingsXlsx } from '@/lib/pricelabs/parse';
import { downloadPortfolioReport } from '@/lib/pricelabs/download-report';
import * as XLSX from 'xlsx';

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

  // If ?include=portfolio, also sync portfolio reports for Marcus
  const includePortfolio = req.nextUrl.searchParams.get('include') === 'portfolio';
  let portfolioResults: { segment: string; rowCount: number }[] | undefined;
  if (includePortfolio) {
    const marcus = clients.find(c =>
      c.client_name.toLowerCase().includes('marcus') ||
      c.client_name.toLowerCase().includes('halawi')
    );
    if (marcus) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await loginToPriceLabs(browser, marcus.email, marcus.password);
        try {
          const supabase = createSupabaseAdmin();
          const today = new Date().toISOString().split('T')[0];
          portfolioResults = [];
          for (const seg of PORTFOLIO_SEGMENTS) {
            try {
              const buffer = await downloadPortfolioReport(page, seg);
              const reportData = parsePortfolioXlsx(buffer, seg);
              await supabase.from('portfolio_reports').upsert(
                { client_id: marcus.id, report_date: today, segment: seg, report_data: reportData },
                { onConflict: 'client_id,report_date,segment' }
              );
              portfolioResults.push({ segment: seg, rowCount: reportData.rowCount });
            } catch (e) {
              portfolioResults.push({ segment: seg, rowCount: 0 });
            }
          }
        } finally { await context.close(); }
      } finally { await browser.close(); }
    }
  }

  const allOk = results.every(r => r.status === 'ok');
  return NextResponse.json(
    { success: allOk, results, portfolioResults },
    { status: allOk ? 200 : 207 }
  );
}

// POST — manual portfolio report sync (uses the same Playwright setup that works for GET)
const PORTFOLIO_SEGMENTS = ['all', 'ph', 'building', 'weeks'] as const;

function parsePortfolioXlsx(buffer: Buffer, segment: string) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Workbook has no sheets');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rows.length === 0) throw new Error('Report is empty');
  return { fileName: `portfolio-report-${segment}.xlsx`, uploadedAt: new Date().toISOString(), segment, rawRows: rows, rowCount: rows.length };
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clients = await getActiveClients();
  const client = clients.find(c =>
    c.client_name.toLowerCase().includes('marcus') ||
    c.client_name.toLowerCase().includes('halawi')
  );
  if (!client) {
    return NextResponse.json({ error: 'Client "Marcus Halawi" not found' }, { status: 404 });
  }

  const browser = await launchBrowser();
  const results: { segment: string; rowCount: number }[] = [];

  try {
    const { context, page } = await loginToPriceLabs(browser, client.email, client.password);
    try {
      const supabase = createSupabaseAdmin();
      const today = new Date().toISOString().split('T')[0];

      for (const segment of PORTFOLIO_SEGMENTS) {
        try {
          const buffer = await downloadPortfolioReport(page, segment);
          const reportData = parsePortfolioXlsx(buffer, segment);
          const { error } = await supabase
            .from('portfolio_reports')
            .upsert(
              { client_id: client.id, report_date: today, segment, report_data: reportData },
              { onConflict: 'client_id,report_date,segment' }
            );
          if (error) throw new Error(`Failed to store ${segment} report: ${error.message}`);
          results.push({ segment, rowCount: reportData.rowCount });
        } catch (segErr) {
          results.push({ segment, rowCount: 0, error: String(segErr) } as any);
        }
      }

      return NextResponse.json({ success: results.length > 0, clientName: client.client_name, reportDate: today, reports: results });
    } finally { await context.close(); }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally { await browser.close(); }
}
