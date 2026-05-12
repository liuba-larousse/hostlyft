import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getActiveClients } from '@/lib/supabase/clients';
import { launchBrowser } from '@/lib/pricelabs/browser';
import { loginToPriceLabs } from '@/lib/pricelabs/login';
import { downloadPortfolioReport } from '@/lib/pricelabs/download-report';
import * as XLSX from 'xlsx';

export const maxDuration = 300;

/** Parse the downloaded XLSX into a structured report object */
function parsePortfolioXlsx(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Workbook has no sheets');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rows.length === 0) throw new Error('Report is empty');

  return {
    fileName: 'portfolio-report.xlsx',
    uploadedAt: new Date().toISOString(),
    rawRows: rows,
    rowCount: rows.length,
  };
}

/** Find Marcus Halawi's client and download + store the report */
async function syncPortfolioReport() {
  const clients = await getActiveClients();
  const client = clients.find(c =>
    c.client_name.toLowerCase().includes('marcus') ||
    c.client_name.toLowerCase().includes('halawi')
  );

  if (!client) {
    throw new Error('Client "Marcus Halawi" not found in active clients');
  }

  const browser = await launchBrowser();
  try {
    const { context, page } = await loginToPriceLabs(browser, client.email, client.password);
    try {
      const buffer = await downloadPortfolioReport(page);
      const reportData = parsePortfolioXlsx(buffer);

      const supabase = createSupabaseAdmin();
      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('portfolio_reports')
        .upsert(
          {
            client_id: client.id,
            report_date: today,
            report_data: reportData,
          },
          { onConflict: 'client_id,report_date' }
        );

      if (error) throw new Error(`Failed to store report: ${error.message}`);

      return {
        success: true,
        clientName: client.client_name,
        reportDate: today,
        rowCount: reportData.rowCount,
      };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

// GET — Vercel Cron (daily at 9am CET) OR fetch stored reports
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = secret && authHeader === `Bearer ${secret}`;

  if (isCron) {
    // Cron trigger — run the sync
    try {
      const result = await syncPortfolioReport();
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // Dashboard request — return stored reports
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();

  const { data: clientData } = await supabase
    .from('pricelabs_clients')
    .select('id')
    .or('client_name.ilike.%marcus%,client_name.ilike.%halawi%')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (!clientData) {
    return NextResponse.json({ reports: [] });
  }

  const { data: reports } = await supabase
    .from('portfolio_reports')
    .select('*')
    .eq('client_id', clientData.id)
    .order('report_date', { ascending: false })
    .limit(90);

  return NextResponse.json({ reports: reports ?? [] });
}

// POST — manual sync from dashboard
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncPortfolioReport();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
