// Screenshot key pages in light/dark and at phone width for visual review.
//   node e2e/screenshots.mjs http://localhost:3000 ./shots  (EMAIL/PASSWORD env override the local demo admin)
import { chromium } from "playwright";
const [BASE, OUT] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" });
const errors = [];
async function session(theme, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: theme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  return { ctx, page };
}
const { ctx: c0, page: p0 } = await session("light", { width: 1440, height: 900 });
await p0.screenshot({ path: `${OUT}/signin-light.png` });
await p0.fill("#email", process.env.EMAIL ?? "admin@demo.techvaults.local");
await p0.fill("#password", process.env.PASSWORD ?? "local-e2e-admin-pass");
await p0.click("button[type=submit]");
await p0.waitForURL(/overview/);
const cookies = await c0.cookies();
for (const [theme, vp, tag] of [["light", { width: 1440, height: 900 }, "light"], ["dark", { width: 1440, height: 900 }, "dark"], ["light", { width: 390, height: 844 }, "mobile"]]) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  for (const path of tag === "mobile" ? ["/overview", "/members"] : ["/overview", "/members", "/ledger", "/approvals", "/officers", "/trial-balance"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${tag}-${path.slice(1)}.png`, fullPage: tag !== "mobile" });
    if (tag === "mobile") {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) errors.push(`${path} overflows at phone width`);
    }
  }
  if (tag === "light") {
    const m = await page.goto(`${BASE}/members`, { waitUntil: "networkidle" });
    await page.click("tbody tr a >> nth=2");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/light-member.png`, fullPage: true });
    await page.keyboard.press("Meta+k");
    await page.keyboard.type("chi");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/light-palette.png` });
  }
  await ctx.close();
}
const land = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await land.goto(`${BASE}/`, { waitUntil: "networkidle" });
await land.screenshot({ path: `${OUT}/landing.png`, fullPage: true });
console.log(errors.length ? errors.join("\n") : "no client errors");
await browser.close();
