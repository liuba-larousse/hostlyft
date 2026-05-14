/**
 * Standalone script to sync PriceLabs reports via Playwright.
 * Designed to run in GitHub Actions (full VM, no Vercel limits).
 *
 * Usage: npx tsx scripts/sync-reports.ts
 *
 * Required env vars:
 *   PRICELABS_EMAIL, PRICELABS_PASSWORD
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ENCRYPTION_KEY (for decrypting stored credentials as fallback)
 */

import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';

// ---- Config ----

const REPORT_URLS: Record<string, string> = {
  all: 'https://app.pricelabs.co/report-builder/9276',
  building: 'https://app.pricelabs.co/report-builder/10420',
  weeks: 'https://app.pricelabs.co/report-builder/10678',
  listing: 'https://app.pricelabs.co/report-builder/10744',
};

const LOGIN_URL = 'https://app.pricelabs.co/';
const TIMEOUT = 60_000;

// ---- Supabase ----

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getClientId(): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('pricelabs_clients')
    .select('id')
    .or('client_name.ilike.%marcus%,client_name.ilike.%halawi%')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ---- PriceLabs Login ----

async function login(email: string, password: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('Navigating to PriceLabs...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

  await page.waitForSelector(
    'input[type="email"], input[name="email"], input[placeholder*="email" i]',
    { timeout: TIMEOUT }
  );

  console.log('Logging in...');
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in")');
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

  const url = page.url();
  if (url.includes('/signin') || url.includes('/login')) {
    const errorText = await page.locator('[class*="error"], [class*="alert"], [role="alert"]').textContent().catch(() => '');
    await browser.close();
    throw new Error(`Login failed: still on login page. ${errorText}`);
  }

  console.log('Login successful.');
  return { browser, context, page };
}

// ---- Download Report ----

async function downloadReport(page: any, segment: string): Promise<Buffer> {
  const url = REPORT_URLS[segment];
  console.log(`  Downloading ${segment} from ${url}...`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const downloadBtn = page.locator('#rb-template-top-panel-download-report-btn');
  await downloadBtn.waitFor({ state: 'visible', timeout: 15_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT });
  await downloadBtn.click();
  const download = await downloadPromise;

  const filePath = await download.path();
  if (!filePath) throw new Error(`Download failed for ${segment}`);

  const buffer = readFileSync(filePath);
  console.log(`  Downloaded ${segment}: ${buffer.length} bytes`);
  return buffer;
}

// ---- Parse & Store ----

function parseXlsx(buffer: Buffer, segment: string) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Empty workbook');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return {
    fileName: `portfolio-report-${segment}.xlsx`,
    uploadedAt: new Date().toISOString(),
    segment,
    rawRows: rows,
    rowCount: rows.length,
  };
}

// ---- Main ----

async function main() {
  const email = process.env.PRICELABS_EMAIL;
  const password = process.env.PRICELABS_PASSWORD;

  if (!email || !password) {
    throw new Error('PRICELABS_EMAIL and PRICELABS_PASSWORD are required');
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const clientId = await getClientId();
  if (!clientId) throw new Error('Client not found in pricelabs_clients');

  const { browser, context, page } = await login(email, password);
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];
  const results: { segment: string; rows: number; ok: boolean }[] = [];

  try {
    for (const segment of Object.keys(REPORT_URLS)) {
      try {
        const buffer = await downloadReport(page, segment);
        const reportData = parseXlsx(buffer, segment);

        const { error } = await supabase
          .from('portfolio_reports')
          .upsert(
            { client_id: clientId, report_date: today, segment, report_data: reportData },
            { onConflict: 'client_id,report_date,segment' }
          );

        if (error) {
          console.error(`  Supabase error for ${segment}:`, error.message);
          results.push({ segment, rows: 0, ok: false });
        } else {
          console.log(`  Saved ${segment}: ${reportData.rowCount} rows`);
          results.push({ segment, rows: reportData.rowCount, ok: true });
        }
      } catch (e: any) {
        console.error(`  Failed ${segment}:`, e.message);
        results.push({ segment, rows: 0, ok: false });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n--- Results ---');
  results.forEach(r => console.log(`  ${r.segment}: ${r.ok ? `${r.rows} rows` : 'FAILED'}`));

  const allOk = results.every(r => r.ok);
  if (!allOk) {
    process.exit(1);
  }
  console.log(`\nAll ${results.length} reports synced for ${today}.`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
