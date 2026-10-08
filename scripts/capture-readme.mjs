#!/usr/bin/env node
/**
 * Capture README dashboard screenshots (Retina → framed WebP).
 *
 * Requires a running panel (frontend + backend) and owner credentials:
 *
 *   CAPTURE_USER=admin CAPTURE_PASSWORD='…' npm run docs:screenshot
 *
 * Optional:
 *   CAPTURE_URL=http://127.0.0.1:5173
 *   CAPTURE_LANG=en
 *   CAPTURE_WIDTH=1600
 *   CAPTURE_HEIGHT=1135
 *   CAPTURE_SCALE=2
 *
 * First run may need: npx playwright install chromium
 * (or install Google Chrome and the script will prefer channel "chrome").
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const docsDir = path.join(root, 'docs');

const baseUrl = (process.env.CAPTURE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const user = process.env.CAPTURE_USER ?? '';
const password = process.env.CAPTURE_PASSWORD ?? '';
const lang = process.env.CAPTURE_LANG ?? 'en';
// Wide enough for 4 KPI cards in a row; tall enough to show Spending by project.
const viewportW = Number(process.env.CAPTURE_WIDTH ?? 1600);
const viewportH = Number(process.env.CAPTURE_HEIGHT ?? 1135);
const scale = Number(process.env.CAPTURE_SCALE ?? 2);
const outMaxWidth = Number(process.env.CAPTURE_OUT_WIDTH ?? 1680);

// The frame follows the panel's own look: the stone canvas, one soft line, rounded corners.
const radius = 14;
const pad = 36;
const gap = 8;
const strokeW = 2;

const PANEL = {
  dark: { r: 0x15, g: 0x15, b: 0x14, alpha: 1 },
  light: { r: 0xf4, g: 0xf4, b: 0xf1, alpha: 1 },
};
const HAIRLINE = {
  dark: '#2d2d2a',
  light: '#ebebe7',
};

function fail(msg) {
  console.error(`docs:screenshot: ${msg}`);
  process.exit(1);
}

async function frameScreenshot(pngBuf, panelColor, hairline) {
  let img = sharp(pngBuf).ensureAlpha();
  const meta = await img.metadata();
  if (meta.width > outMaxWidth) {
    img = img.resize({ width: outMaxWidth, withoutEnlargement: true });
  }
  const shot = await img.png().toBuffer();
  const { width: iw, height: ih } = await sharp(shot).metadata();
  const outer = gap + strokeW;
  const w = iw + outer * 2;
  const h = ih + outer * 2;
  const outerR = radius + outer;

  const base = await sharp({
    create: { width: w, height: h, channels: 4, background: panelColor },
  })
    .composite([{ input: shot, left: outer, top: outer }])
    .png()
    .toBuffer();

  const roundedMask = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" rx="${outerR}" ry="${outerR}" fill="#fff"/>
</svg>`);

  const rounded = await sharp(base)
    .composite([{ input: roundedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const border = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${strokeW / 2}" y="${strokeW / 2}" width="${w - strokeW}" height="${h - strokeW}"
        rx="${outerR - strokeW / 2}" ry="${outerR - strokeW / 2}"
        fill="none" stroke="${hairline}" stroke-width="${strokeW}"/>
</svg>`);

  const framed = await sharp(rounded)
    .composite([{ input: border, blend: 'over' }])
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: w + pad * 2,
      height: h + pad * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: framed, left: pad, top: pad }])
    .webp({ quality: 92, alphaQuality: 95, effort: 5 })
    .toBuffer();
}

async function launchBrowser() {
  const common = {
    headless: true,
    args: ['--disable-dev-shm-usage'],
  };
  for (const opts of [
    { ...common, channel: 'chrome' },
    { ...common, channel: 'chromium' },
    common,
  ]) {
    try {
      return await chromium.launch(opts);
    } catch {
      // try next launch strategy
    }
  }
  fail('could not launch a browser (install Chrome or run: npx playwright install chromium)');
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-username').waitFor({ state: 'visible', timeout: 30_000 });
  await page.fill('#login-username', user);
  await page.fill('#login-password', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 }),
    page.locator('form button[type="submit"]').click(),
  ]);
}

async function waitForDashboard(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('[data-kpi-card]').first().waitFor({ state: 'visible', timeout: 60_000 });
  // Charts / badges settle after the summary query.
  await page.waitForTimeout(1200);
}

async function captureTheme(browser, scheme) {
  const context = await browser.newContext({
    viewport: { width: viewportW, height: viewportH },
    deviceScaleFactor: scale,
    colorScheme: scheme,
    locale: lang === 'ru' ? 'ru-RU' : 'en-US',
  });
  await context.addInitScript(
    ({ scheme: s, lng }) => {
      localStorage.setItem('color-scheme', s);
      // The app's language detector reads the 'lang' key.
      localStorage.setItem('lang', lng);
    },
    { scheme, lng: lang },
  );

  const page = await context.newPage();

  await login(page);
  await waitForDashboard(page);

  // Re-assert theme after login navigation (storage persists, class should match).
  await page.evaluate((s) => {
    localStorage.setItem('color-scheme', s);
    document.documentElement.classList.toggle('dark', s === 'dark');
  }, scheme);
  await page.addStyleTag({
    content: 'html,body{overflow:hidden !important} ::-webkit-scrollbar{display:none !important}',
  });
  await page.waitForTimeout(500);

  // Viewport only — #root.screenshot() includes full scroll height and looks stretched in README.
  const png = await page.screenshot({ type: 'png', fullPage: false });
  await context.close();
  return png;
}

async function main() {
  if (!user || !password) {
    fail('set CAPTURE_USER and CAPTURE_PASSWORD');
  }

  console.log(`Capturing ${baseUrl} @ ${viewportW}×${viewportH}×${scale} (lang=${lang})`);
  const browser = await launchBrowser();
  try {
    await mkdir(docsDir, { recursive: true });
    for (const scheme of ['dark', 'light']) {
      const png = await captureTheme(browser, scheme);
      const rawPath = path.join(docsDir, `screenshot-${scheme}.raw.png`);
      await writeFile(rawPath, png);
      const webp = await frameScreenshot(png, PANEL[scheme], HAIRLINE[scheme]);
      const outPath = path.join(docsDir, `screenshot-${scheme}.webp`);
      await writeFile(outPath, webp);
      const meta = await sharp(webp).metadata();
      console.log(
        `wrote ${path.relative(root, outPath)} (${meta.width}×${meta.height}, ${webp.length} bytes)`,
      );
      console.log(`      raw ${path.relative(root, rawPath)} (${png.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
