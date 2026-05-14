/**
 * Standalone script to sync PriceLabs reports via Playwright.
 * Reads ALL client credentials from Supabase (encrypted), handles both
 * direct login and RM Portal login flows.
 *
 * Usage: npx tsx scripts/sync-reports.ts
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { createDecipheriv } from 'crypto';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';

// ---- Config ----

// Report Builder URLs — currently configured for Marcus/Cloud9.
// TODO: make these per-client if other clients need different reports.
const REPORT_URLS: Record<string, string> = {
  all: 'https://app.pricelabs.co/report-builder/9276',
  building: 'https://app.pricelabs.co/report-builder/10420',
  weeks: 'https://app.pricelabs.co/report-builder/10678',
  listing: 'https://app.pricelabs.co/report-builder/10744',
};

const LOGIN_URL = 'https://app.pricelabs.co/';
const RM_PARTNERS_URL = 'https://app.pricelabs.co/rm-partners';
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

interface Client {
  id: string;
  client_name: string;
  email: string;
  password: string;
  connection_type: 'direct' | 'rm_portal';
}

interface RmCreds {
  email: string;
  password: string;
}

async function getActiveClients(): Promise<Client[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name, email, password_encrypted, connection_type')
    .eq('active', true)
    .order('client_name');
  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return (data ?? []).map(row => ({
    id: row.id,
    client_name: row.client_name,
    email: row.email,
    password: row.password_encrypted ? decrypt(row.password_encrypted) : '',
    connection_type: row.connection_type ?? 'direct',
  }));
}

async function getRmPortalCredentials(): Promise<RmCreds | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('rm_portal_credentials')
    .select('email, password_encrypted')
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { email: data.email, password: decrypt(data.password_encrypted) };
}

// ---- Playwright helpers ----

async function loginToPriceLabs(browser: Browser, email: string, password: string) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log(`  Logging in as ${email}...`);
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForSelector(
    'input[type="email"], input[name="email"], input[placeholder*="email" i]',
    { timeout: TIMEOUT }
  );
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in")');
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

  const url = page.url();
  if (url.includes('/signin') || url.includes('/login')) {
    const errorText = await page.locator('[class*="error"], [class*="alert"], [role="alert"]').textContent().catch(() => '');
    await context.close();
    throw new Error(`Login failed for ${email}: ${errorText}`);
  }

  console.log('  Login successful.');
  return { context, page };
}

async function switchToRmClient(page: Page, clientName: string) {
  console.log(`  Switching to RM client: ${clientName}...`);
  await page.goto(RM_PARTNERS_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
  await page.waitForTimeout(2000);

  // Try exact match first
  const clientCard = page.locator(`text="${clientName}"`).first();
  try {
    await clientCard.waitFor({ timeout: 10_000 });
    await clientCard.click();
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    await page.waitForTimeout(3000);
    console.log(`  Switched to ${clientName}.`);
    return;
  } catch {}

  // Partial match fallback
  const cards = page.locator('[class*="card"], [class*="partner"], [class*="client"]');
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const text = await cards.nth(i).textContent();
    if (text && text.toLowerCase().includes(clientName.toLowerCase())) {
      await cards.nth(i).click();
      await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
      await page.waitForTimeout(3000);
      console.log(`  Switched to ${clientName}.`);
      return;
    }
  }
  throw new Error(`Could not find client "${clientName}" on RM Partners page`);
}

async function downloadReport(page: Page, segment: string): Promise<Buffer> {
  const url = REPORT_URLS[segment];
  console.log(`    Downloading ${segment}...`);

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
  console.log(`    ${segment}: ${buffer.length} bytes`);
  return buffer;
}

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

async function syncReportsForClient(page: Page, clientId: string, clientName: string) {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];
  const results: { segment: string; rows: number; ok: boolean }[] = [];

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
        console.error(`    Supabase error for ${segment}:`, error.message);
        results.push({ segment, rows: 0, ok: false });
      } else {
        console.log(`    Saved ${segment}: ${reportData.rowCount} rows`);
        results.push({ segment, rows: reportData.rowCount, ok: true });
      }
    } catch (e: any) {
      console.error(`    Failed ${segment}:`, e.message);
      results.push({ segment, rows: 0, ok: false });
    }
  }

  return results;
}

// ---- Main ----

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY required to decrypt credentials');
  }

  const clients = await getActiveClients();
  const rmCreds = await getRmPortalCredentials();

  if (clients.length === 0) {
    console.log('No active clients found.');
    return;
  }

  const directClients = clients.filter(c => c.connection_type === 'direct');
  const rmClients = clients.filter(c => c.connection_type === 'rm_portal');
  const allResults: { client: string; results: any[] }[] = [];

  // ---- Direct clients: one browser session per client ----
  for (const client of directClients) {
    console.log(`\n=== ${client.client_name} (direct) ===`);
    const browser = await chromium.launch({ headless: true });
    try {
      const { context, page } = await loginToPriceLabs(browser, client.email, client.password);
      try {
        const results = await syncReportsForClient(page, client.id, client.client_name);
        allResults.push({ client: client.client_name, results });
      } finally {
        await context.close();
      }
    } catch (e: any) {
      console.error(`  Error for ${client.client_name}:`, e.message);
      allResults.push({ client: client.client_name, results: [{ segment: 'all', rows: 0, ok: false }] });
    } finally {
      await browser.close();
    }
  }

  // ---- RM Portal clients: single browser, switch between clients ----
  if (rmClients.length > 0) {
    if (!rmCreds) {
      console.error('\nRM Portal clients found but no RM credentials configured.');
      rmClients.forEach(c => allResults.push({ client: c.client_name, results: [{ segment: 'all', rows: 0, ok: false }] }));
    } else {
      console.log(`\n=== RM Portal (${rmClients.length} clients) ===`);
      const browser = await chromium.launch({ headless: true });
      try {
        const { context, page } = await loginToPriceLabs(browser, rmCreds.email, rmCreds.password);
        try {
          for (const client of rmClients) {
            console.log(`\n--- ${client.client_name} (rm_portal) ---`);
            try {
              await switchToRmClient(page, client.client_name);
              const results = await syncReportsForClient(page, client.id, client.client_name);
              allResults.push({ client: client.client_name, results });
            } catch (e: any) {
              console.error(`  Error for ${client.client_name}:`, e.message);
              allResults.push({ client: client.client_name, results: [{ segment: 'all', rows: 0, ok: false }] });
            }
          }
        } finally {
          await context.close();
        }
      } catch (e: any) {
        console.error('RM Portal login failed:', e.message);
        rmClients.forEach(c => allResults.push({ client: c.client_name, results: [{ segment: 'all', rows: 0, ok: false }] }));
      } finally {
        await browser.close();
      }
    }
  }

  // ---- Summary ----
  console.log('\n\n========== SUMMARY ==========');
  let anyFailed = false;
  allResults.forEach(({ client, results }) => {
    const ok = results.every(r => r.ok);
    if (!ok) anyFailed = true;
    const details = results.map(r => `${r.segment}: ${r.ok ? `${r.rows} rows` : 'FAILED'}`).join(', ');
    console.log(`  ${ok ? 'OK' : 'FAIL'}  ${client} — ${details}`);
  });

  if (anyFailed) {
    console.log('\nSome reports failed. Check logs above.');
    process.exit(1);
  }
  console.log(`\nAll reports synced successfully.`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
