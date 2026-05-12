import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getActiveClients } from '@/lib/supabase/clients';
import { launchBrowser } from '@/lib/pricelabs/browser';
import { loginToPriceLabs } from '@/lib/pricelabs/login';
import { downloadPortfolioReport } from '@/lib/pricelabs/download-report';
import * as XLSX from 'xlsx';

export const maxDuration = 300;

const SEGMENTS = ['all', 'ph', 'building', 'weeks'] as const;

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

// GET — Vercel Cron only (Bearer token required)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clients = await getActiveClients();
  const client = clients.find(c =>
    c.client_name.toLowerCase().includes('marcus') ||
    c.client_name.toLowerCase().includes('halawi')
  );

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

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
        results.push({ segment, rowCount: reportData.rowCount });
      }

      return NextResponse.json({
        success: true,
        clientName: client.client_name,
        reportDate: today,
        reports: results,
      });
    } finally {
      await context.close();
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    await browser.close();
  }
}
