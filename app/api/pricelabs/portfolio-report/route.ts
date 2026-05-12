import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getActiveClients } from '@/lib/supabase/clients';
import { launchBrowser } from '@/lib/pricelabs/browser';
import { loginToPriceLabs } from '@/lib/pricelabs/login';
import { downloadPortfolioReport } from '@/lib/pricelabs/download-report';
import * as XLSX from 'xlsx';

export const maxDuration = 300;

// Marcus Halawi — the client whose report we sync
const TARGET_CLIENT_NAME = 'Marcus Halawi';

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

// POST — trigger a sync
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find Marcus Halawi's credentials
  const clients = await getActiveClients();
  const client = clients.find(c =>
    c.client_name.toLowerCase().includes('marcus') ||
    c.client_name.toLowerCase().includes('halawi')
  );

  if (!client) {
    return NextResponse.json(
      { error: `Client "${TARGET_CLIENT_NAME}" not found in active clients` },
      { status: 404 }
    );
  }

  const browser = await launchBrowser();
  try {
    const { context, page } = await loginToPriceLabs(browser, client.email, client.password);
    try {
      const buffer = await downloadPortfolioReport(page);
      const reportData = parsePortfolioXlsx(buffer);

      // Store in Supabase
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

      return NextResponse.json({
        success: true,
        clientName: client.client_name,
        reportDate: today,
        rowCount: reportData.rowCount,
      });
    } finally {
      await context.close();
    }
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  } finally {
    await browser.close();
  }
}

// GET — fetch stored reports
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();

  // Find Marcus's client ID
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
    .limit(30);

  return NextResponse.json({ reports: reports ?? [] });
}
