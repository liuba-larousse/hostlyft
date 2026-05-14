/**
 * Standalone script to sync PriceLabs reports via Playwright.
 * Reads client credentials from Supabase (encrypted), decrypts them,
 * logs into PriceLabs, downloads reports, saves back to Supabase.
 *
 * Usage: npx tsx scripts/sync-reports.ts
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY
 */

import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { createDecipheriv } from 'crypto';
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

// ---- Crypto (mirrors lib/crypto/encrypt.ts) ----

function decrypt(ciphertext: string): string {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY must be 64-char hex');
  const key = Buffer.from(hex, 'hex');
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ---- Supabase ----

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface ClientRow {
  id: string;
  client_name: string;
  email: string;
  password_encrypted: string;
  connection_type: string;
}

async function getMarcusClient(): Promise<{ id: string; email: string; password: string } | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name, email, password_encrypted, connection_type')
    .or('client_name.ilike.%marcus%,client_name.ilike.%halawi%')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (!data || !data.password_encrypted) return null;

  return {
    id: data.id,
    email: data.email,
    password: decrypt(data.password_encrypted),
  };
}

// ---- PriceLabs Login ----

async function login(email: string, password: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log(`Navigating to PriceLabs as ${email}...`);
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
    throw new Error(`Login failed for ${email}: ${errorText}`);
  }

  console.log('Login successful.');
  return { browser, context, page };
}

// ---- Download Report ----

async function downloadReport(page: any, segment: string): Promise<Buffer> {
  const url = REPORT_URLS[segment];
  console.log(`  Downloading ${segment}...`);

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
  console.log(`  ${segment}: ${buffer.length} bytes`);
  return buffer;
}

// ---- Parse ----

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
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is required to decrypt client credentials');
  }

  // Read credentials from Supabase
  const client = await getMarcusClient();
  if (!client) throw new Error('Marcus Halawi client not found or missing credentials');

  console.log(`Client: ${client.email} (id: ${client.id})`);

  const { browser, context, page } = await login(client.email, client.password);
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
            { client_id: client.id, report_date: today, segment, report_data: reportData },
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
  if (!allOk) process.exit(1);
  console.log(`\nAll ${results.length} reports synced for ${today}.`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
