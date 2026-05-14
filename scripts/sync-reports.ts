/**
 * Standalone script to sync PriceLabs reports via Playwright.
 * Reads ALL client credentials from Supabase (encrypted), handles both
 * direct login and RM Portal login flows.
 *
 * Each step is wrapped in a named test function for clear error identification.
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

// Fallback URLs for Marcus — other clients must have report_urls in DB
const DEFAULT_REPORT_URLS: Record<string, string> = {
  all: 'https://app.pricelabs.co/report-builder/9276',
  building: 'https://app.pricelabs.co/report-builder/10420',
  weeks: 'https://app.pricelabs.co/report-builder/10678',
  listing: 'https://app.pricelabs.co/report-builder/10744',
};

const LOGIN_URL = 'https://app.pricelabs.co/';
const RM_PARTNERS_URL = 'https://app.pricelabs.co/rm-partners';
const TIMEOUT = 60_000;

// ---- Step runner ----

interface StepResult {
  step: string;
  ok: boolean;
  duration: number;
  error?: string;
  detail?: string;
}

const allSteps: StepResult[] = [];

async function runStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`\n▶ ${name}...`);
  try {
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`  ✓ ${name} (${duration}ms)`);
    allSteps.push({ step: name, ok: true, duration });
    return result;
  } catch (e: any) {
    const duration = Date.now() - start;
    const msg = e.message || String(e);
    console.error(`  ✗ ${name} FAILED (${duration}ms): ${msg}`);
    allSteps.push({ step: name, ok: false, duration, error: msg });
    throw e;
  }
}

// ---- Crypto ----

function testDecrypt(ciphertext: string): string {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY must be 64-char hex');
  const key = Buffer.from(hex, 'hex');
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid ciphertext format');
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
  report_urls: Record<string, string> | null;
}

interface RmCreds {
  email: string;
  password: string;
}

// ---- Test functions ----

async function testEnvVars(): Promise<void> {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ENCRYPTION_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL!.slice(0, 30)}...`);
  console.log(`  ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY!.slice(0, 8)}...`);
}

async function testSupabaseConnection(): Promise<void> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('pricelabs_clients')
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  console.log(`  Connected. ${count} clients in table.`);
}

async function testFetchClients(): Promise<Client[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pricelabs_clients')
    .select('id, client_name, email, password_encrypted, connection_type, report_urls')
    .eq('active', true)
    .order('client_name');
  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error('No active clients found');

  const clients: Client[] = [];
  for (const row of data) {
    try {
      const password = row.password_encrypted ? testDecrypt(row.password_encrypted) : '';
      // Use per-client report_urls, fall back to defaults for Marcus
      const isMarcus = row.client_name.toLowerCase().includes('marcus') || row.client_name.toLowerCase().includes('halawi');
      const reportUrls = row.report_urls || (isMarcus ? DEFAULT_REPORT_URLS : null);
      clients.push({
        id: row.id,
        client_name: row.client_name,
        email: row.email,
        password,
        connection_type: row.connection_type ?? 'direct',
        report_urls: reportUrls,
      });
      const urlStatus = reportUrls ? `${Object.keys(reportUrls).length} report URLs` : 'no report URLs (will skip)';
      console.log(`  ✓ ${row.client_name} (${row.connection_type || 'direct'}) — ${urlStatus}`);
    } catch (e: any) {
      console.error(`  ✗ ${row.client_name} — decrypt failed: ${e.message}`);
      allSteps.push({ step: `Decrypt ${row.client_name}`, ok: false, duration: 0, error: e.message });
    }
  }

  if (clients.length === 0) throw new Error('All client credential decryptions failed');
  return clients;
}

async function testFetchRmCredentials(): Promise<RmCreds | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('rm_portal_credentials')
    .select('email, password_encrypted')
    .limit(1)
    .maybeSingle();
  if (!data) {
    console.log('  No RM Portal credentials configured (ok if no rm_portal clients)');
    return null;
  }
  const creds = { email: data.email, password: testDecrypt(data.password_encrypted) };
  console.log(`  RM Portal: ${creds.email}`);
  return creds;
}

async function testBrowserLaunch(): Promise<Browser> {
  const browser = await chromium.launch({ headless: true });
  const version = browser.version();
  console.log(`  Chromium ${version}`);
  return browser;
}

async function testLogin(browser: Browser, email: string, password: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

  await page.waitForSelector(
    'input[type="email"], input[name="email"], input[placeholder*="email" i]',
    { timeout: TIMEOUT }
  );
  console.log(`  Login page loaded. Filling credentials for ${email}...`);

  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in")');
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

  const url = page.url();
  if (url.includes('/signin') || url.includes('/login')) {
    const errorText = await page.locator('[class*="error"], [class*="alert"], [role="alert"]').textContent().catch(() => '');
    throw new Error(`Still on login page after submit. Error: "${errorText}". URL: ${url}`);
  }

  console.log(`  Logged in. Current URL: ${url}`);
  return { context, page };
}

async function testSwitchRmClient(page: Page, clientName: string): Promise<void> {
  await page.goto(RM_PARTNERS_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
  await page.waitForTimeout(2000);

  // Try exact match
  const clientCard = page.locator(`text="${clientName}"`).first();
  try {
    await clientCard.waitFor({ timeout: 10_000 });
    await clientCard.click();
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    await page.waitForTimeout(3000);
    console.log(`  Switched to ${clientName}`);
    return;
  } catch {}

  // Partial match
  const cards = page.locator('[class*="card"], [class*="partner"], [class*="client"]');
  const count = await cards.count();
  const available: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await cards.nth(i).textContent();
    if (text) available.push(text.trim().slice(0, 50));
    if (text && text.toLowerCase().includes(clientName.toLowerCase())) {
      await cards.nth(i).click();
      await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
      await page.waitForTimeout(3000);
      console.log(`  Switched to ${clientName} (partial match)`);
      return;
    }
  }
  throw new Error(`Client "${clientName}" not found on RM Partners page. Available: ${available.join(' | ')}`);
}

async function testDownloadReport(page: Page, segment: string, reportUrl?: string): Promise<Buffer> {
  const url = reportUrl || DEFAULT_REPORT_URLS[segment];

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Check if report page loaded
  const pageTitle = await page.title();
  const pageUrl = page.url();
  console.log(`  Page: "${pageTitle}" at ${pageUrl}`);

  const downloadBtn = page.locator('#rb-template-top-panel-download-report-btn');
  const btnVisible = await downloadBtn.isVisible().catch(() => false);
  if (!btnVisible) {
    // Try to find any download button as fallback
    const altBtn = page.locator('button:has-text("Download"), button:has-text("Export")');
    const altVisible = await altBtn.isVisible().catch(() => false);
    if (!altVisible) {
      throw new Error(`Download button not found on ${url}. Page may not have loaded correctly.`);
    }
  }

  await downloadBtn.waitFor({ state: 'visible', timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT });
  await downloadBtn.click();
  const download = await downloadPromise;

  const filePath = await download.path();
  if (!filePath) throw new Error('Download completed but no file path returned');

  const buffer = readFileSync(filePath);
  if (buffer.length < 100) throw new Error(`Downloaded file too small (${buffer.length} bytes) — likely an error page`);

  console.log(`  Downloaded: ${buffer.length} bytes`);
  return buffer;
}

function testParseXlsx(buffer: Buffer, segment: string) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  if (wb.SheetNames.length === 0) throw new Error('Workbook has no sheets');

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rows.length === 0) throw new Error('Sheet has no data rows');

  // Validate expected columns
  const cols = Object.keys(rows[0] as any);
  console.log(`  ${rows.length} rows, ${cols.length} columns`);
  console.log(`  Columns: ${cols.slice(0, 5).join(', ')}${cols.length > 5 ? `, ... +${cols.length - 5} more` : ''}`);

  return {
    fileName: `portfolio-report-${segment}.xlsx`,
    uploadedAt: new Date().toISOString(),
    segment,
    rawRows: rows,
    rowCount: rows.length,
  };
}

async function testSaveToSupabase(clientId: string, segment: string, reportData: any): Promise<void> {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('portfolio_reports')
    .upsert(
      { client_id: clientId, report_date: today, segment, report_data: reportData },
      { onConflict: 'client_id,report_date,segment' }
    );

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  console.log(`  Saved to portfolio_reports (${today}, ${segment})`);
}

// ---- Orchestration ----

async function syncClient(browser: Browser, client: Client, context?: BrowserContext, page?: Page) {
  if (!client.report_urls || Object.keys(client.report_urls).length === 0) {
    console.log(`  Skipping ${client.client_name} — no report URLs configured`);
    allSteps.push({ step: `Skip: ${client.client_name}`, ok: true, duration: 0, detail: 'no report URLs' });
    return;
  }

  const isRm = !!context && !!page;

  if (!isRm) {
    const login = await runStep(`Login: ${client.client_name}`, () =>
      testLogin(browser, client.email, client.password)
    );
    context = login.context;
    page = login.page;
  }

  for (const [segment, reportUrl] of Object.entries(client.report_urls)) {
    try {
      const buffer = await runStep(`Download ${segment}: ${client.client_name}`, () =>
        testDownloadReport(page!, segment, reportUrl)
      );

      const reportData = await runStep(`Parse ${segment}: ${client.client_name}`, () =>
        Promise.resolve(testParseXlsx(buffer, segment))
      );

      await runStep(`Save ${segment}: ${client.client_name}`, () =>
        testSaveToSupabase(client.id, segment, reportData)
      );
    } catch (e: any) {
      // Individual segment failure — continue to next segment
      console.error(`  Skipping ${segment} for ${client.client_name}: ${e.message}`);
    }
  }

  if (!isRm && context) {
    await context.close();
  }
}

// ---- Main ----

async function main() {
  console.log('========================================');
  console.log('PriceLabs Report Sync');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================');

  // Pre-flight checks
  await runStep('Check env vars', testEnvVars);
  await runStep('Test Supabase connection', testSupabaseConnection);
  const clients = await runStep('Fetch active clients', testFetchClients);
  const rmCreds = await runStep('Fetch RM Portal credentials', testFetchRmCredentials);

  const directClients = clients.filter(c => c.connection_type === 'direct');
  const rmClients = clients.filter(c => c.connection_type === 'rm_portal');

  console.log(`\n${directClients.length} direct client(s), ${rmClients.length} RM Portal client(s)`);

  // ---- Direct clients ----
  for (const client of directClients) {
    console.log(`\n══════ ${client.client_name} (direct) ══════`);
    const browser = await runStep(`Launch browser: ${client.client_name}`, testBrowserLaunch);
    try {
      await syncClient(browser, client);
    } catch (e: any) {
      console.error(`Fatal error for ${client.client_name}: ${e.message}`);
    } finally {
      await browser.close();
    }
  }

  // ---- RM Portal clients ----
  if (rmClients.length > 0) {
    if (!rmCreds) {
      console.error('\n✗ RM Portal clients exist but no credentials configured');
      rmClients.forEach(c => allSteps.push({ step: `RM: ${c.client_name}`, ok: false, duration: 0, error: 'No RM credentials' }));
    } else {
      console.log(`\n══════ RM Portal (${rmClients.length} clients) ══════`);
      const browser = await runStep('Launch browser: RM Portal', testBrowserLaunch);
      try {
        const { context, page } = await runStep('Login: RM Portal', () =>
          testLogin(browser, rmCreds.email, rmCreds.password)
        );
        try {
          for (const client of rmClients) {
            console.log(`\n── ${client.client_name} (rm_portal) ──`);
            try {
              await runStep(`Switch to: ${client.client_name}`, () =>
                testSwitchRmClient(page, client.client_name)
              );
              await syncClient(browser, client, context, page);
            } catch (e: any) {
              console.error(`Skipping ${client.client_name}: ${e.message}`);
            }
          }
        } finally {
          await context.close();
        }
      } catch (e: any) {
        console.error(`RM Portal login failed: ${e.message}`);
      } finally {
        await browser.close();
      }
    }
  }

  // ---- Final report ----
  console.log('\n\n========================================');
  console.log('RESULTS');
  console.log('========================================');

  const passed = allSteps.filter(s => s.ok);
  const failed = allSteps.filter(s => !s.ok);

  allSteps.forEach(s => {
    const icon = s.ok ? '✓' : '✗';
    const time = `${s.duration}ms`;
    console.log(`  ${icon} ${s.step} (${time})${s.error ? ` — ${s.error}` : ''}`);
  });

  console.log(`\n${passed.length} passed, ${failed.length} failed, ${allSteps.length} total`);
  console.log(`Finished: ${new Date().toISOString()}`);

  if (failed.length > 0) {
    console.log('\nFAILED STEPS:');
    failed.forEach(s => console.log(`  ✗ ${s.step}: ${s.error}`));
    process.exit(1);
  }
}

main().catch(e => {
  console.error('\nFATAL:', e);
  console.log('\nPartial results:');
  allSteps.forEach(s => console.log(`  ${s.ok ? '✓' : '✗'} ${s.step}${s.error ? ` — ${s.error}` : ''}`));
  process.exit(1);
});
