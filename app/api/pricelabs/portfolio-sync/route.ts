import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getActiveClients } from '@/lib/supabase/clients';
// Playwright modules are dynamically imported to avoid bundler issues on Vercel Fluid compute
import { uploadToDrive } from '@/lib/google-drive';
import * as XLSX from 'xlsx';

export const maxDuration = 300;

const SEGMENTS = ['all', 'building', 'weeks'] as const;

function parsePortfolioXlsx(buffer: Buffer, segment: string) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Workbook has no sheets');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rows.length === 0) throw new Error('Report is empty');

  return {
    fileName: `portfolio-report-${segment}.xlsx`,
    uploadedAt: new Date().toISOString(),
    segment,
    rawRows: rows,
    rowCount: rows.length,
  };
}

async function runSync() {
  const clients = await getActiveClients();
  const client = clients.find(c =>
    c.client_name.toLowerCase().includes('marcus') ||
    c.client_name.toLowerCase().includes('halawi')
  );

  if (!client) {
    throw new Error('Client "Marcus Halawi" not found in active clients');
  }

  // Dynamic imports to avoid Vercel bundler issues with playwright-core
  const { launchBrowser } = await import('@/lib/pricelabs/browser');
  const { loginToPriceLabs } = await import('@/lib/pricelabs/login');
  const { downloadPortfolioReport } = await import('@/lib/pricelabs/download-report');

  const browser = await launchBrowser();
  const results: { segment: string; rowCount: number }[] = [];

  try {
    const { context, page } = await loginToPriceLabs(browser, client.email, client.password);
    try {
      const supabase = createSupabaseAdmin();
      const today = new Date().toISOString().split('T')[0];

      for (const segment of SEGMENTS) {
        const buffer = await downloadPortfolioReport(page, segment);
        const reportData = parsePortfolioXlsx(buffer, segment);

        const { error } = await supabase
          .from('portfolio_reports')
          .upsert(
            {
              client_id: client.id,
              report_date: today,
              segment,
              report_data: reportData,
            },
            { onConflict: 'client_id,report_date,segment' }
          );

        if (error) throw new Error(`Failed to store ${segment} report: ${error.message}`);
        try { await uploadToDrive(buffer, `portfolio_${segment}_${today}.xlsx`, `portfolio/${segment}`); } catch {}
        results.push({ segment, rowCount: reportData.rowCount });
      }

      return {
        success: true,
        clientName: client.client_name,
        reportDate: today,
        reports: results,
      };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

// GET — Vercel Cron (Bearer token)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — manual sync from dashboard
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
