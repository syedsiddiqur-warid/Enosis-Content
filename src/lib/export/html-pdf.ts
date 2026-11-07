import "server-only";
import { existsSync } from "node:fs";
import { env } from "@/lib/env";
import { signedPrintUrl } from "./print-url";

const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** CHROME_PATH, or the first Chrome/Edge/Chromium found in the usual places. */
export function findBrowser() {
  if (env.chromePath) return existsSync(env.chromePath) ? env.chromePath : null;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

const FOOTER = `<div style="width:100%;font-family:Arial,sans-serif;font-size:8px;color:#64748b;text-align:center;letter-spacing:.06em;padding:0 16mm">www.enosisbd.com <span style="float:right"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

/** Renders the same HTML template the reviewer saw into an A4 PDF, with the footer on every page. */
export async function renderProfilePdf(profileId: string, version: number): Promise<Buffer> {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error("No Chrome or Edge found for PDF export. Install Chrome or set CHROME_PATH.");
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    const res = await page.goto(await signedPrintUrl(profileId, version), { waitUntil: "networkidle0", timeout: 60_000 });
    if (!res?.ok()) throw new Error(`The print view returned HTTP ${res?.status() ?? "no response"}.`);
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: FOOTER,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
