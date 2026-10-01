// Paints the campaign sky (scripts/paint-sky.ts) in a headless browser and saves it as src/assets/campaign-sky.webp.
// Usage: npm run sky   (starts Vite for the page, then stops it)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5199/');
  const url = await page.evaluate(async () => (await import('/scripts/paint-sky.ts')).galaxyImage());
  writeFileSync(new URL('../src/assets/campaign-sky.webp', import.meta.url), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`campaign-sky.webp: ${Math.round((url.length * 3) / 4 / 1024)} KB`);
} finally {
  await browser.close();
  await server.close();
}
