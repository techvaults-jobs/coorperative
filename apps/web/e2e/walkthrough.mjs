// End-to-end walkthrough of a freshly seeded deployment: sign-in, two-factor setup, members,
// journal posting (including double-submit protection), reversal, trial balance and audit chain.
//
//   BASE=http://localhost:3000 EMAIL=... PASSWORD=... [BROWSER_PATH=/path/to/chromium] [SHOTS=dir] pnpm --filter @techvaults/web e2e
//
// Run it against a new database: it expects the seeded figures and an admin without two-factor yet
// (or set TOTP_SECRET to an existing authenticator secret).
import { chromium } from "playwright";
import { createHmac } from "node:crypto";

const BASE = process.env.BASE;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const SHOTS = process.env.SHOTS;

function base32Decode(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message.slice(0, Number(process.env.ERR_LEN ?? 160))}`));
page.on("console", (m) => {
  if (process.env.ERR_LEN && m.type() === "error") errors.push(`${page.url()} console: ${m.text().slice(0, Number(process.env.ERR_LEN))}`);
});

try {
  // Sign in
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", "wrong-password-123");
  await page.click("button[type=submit]");
  await page.getByText("don't match").waitFor({ timeout: 10000 });
  check("wrong password is refused with a clear message", true);

  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/(security|overview|sign-in\/verify)/, { timeout: 15000 });

  let secret = process.env.TOTP_SECRET;
  if (page.url().includes("/security")) {
    check("officer without two-factor is sent to Security", page.url().includes("required=1"));
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    secret = (await page.locator("code").first().textContent()).trim();
    await page.fill("#code", totp(secret));
    await page.click("button[type=submit]");
    await page.getByText("Two-factor authentication is on.").waitFor({ timeout: 10000 });
    check("two-factor set up with authenticator code", true);
    console.log(`TOTP_SECRET=${secret}`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  } else if (page.url().includes("/sign-in/verify")) {
    await page.fill("#code", totp(secret));
    await page.click("button[type=submit]");
  }
  await page.waitForURL(/\/overview/, { timeout: 15000 });
  check("overview opens after sign-in", true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true });

  // Sign out and back in: two-factor must now be asked for
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/sign-in\/verify/, { timeout: 15000 });
  check("second sign-in asks for the two-factor code", true);
  await page.fill("#code", "000000");
  await page.click("button[type=submit]");
  await page.getByText("isn't right").waitFor();
  check("wrong two-factor code is refused", true);
  await page.fill("#code", totp(secret, Date.now() + 30_000));
  await page.click("button[type=submit]");
  await page.waitForURL(/\/overview/, { timeout: 15000 });

  // Members
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle" });
  const rows = await page.locator("tbody tr").count();
  check("member register lists seeded members", rows >= 10, `${rows} rows`);
  const stamp = Date.now().toString().slice(-6);
  await page.fill("#memberNo", `E2E-${stamp}`);
  await page.fill("#fullName", "Test Member E2E");
  await page.fill("#staffId", `E2E/${stamp}`);
  await page.click("form:has(#memberNo) button[type=submit]");
  await page.getByText(`was added as member E2E-${stamp}`).waitFor({ timeout: 10000 });
  check("secretary can add a member", true);
  await page.fill("#memberNo", `E2E-${stamp}`);
  await page.fill("#fullName", "Duplicate Number");
  await page.click("form:has(#memberNo) button[type=submit]");
  await page.getByText("already exists").waitFor({ timeout: 10000 });
  check("duplicate member number is refused", true);
  await page.goto(`${BASE}/members?q=Chiamaka`, { waitUntil: "networkidle" });
  await page.click("text=Chiamaka Eze");
  await page.getByRole("heading", { name: "Balances" }).waitFor();
  const loan = await page.locator("dd", { hasText: "150,000.00" }).count();
  check("member page shows balances from the ledger", loan > 0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/member.png`, fullPage: true });

  // Journal: post, double-submit, reverse
  await page.goto(`${BASE}/ledger`, { waitUntil: "networkidle" });
  await page.fill("#description", `E2E stationery ${stamp}`);
  await page.selectOption("#debitAccountId", { label: "5200 · Stationery and printing" });
  await page.selectOption("#creditAccountId", { label: "1100 · Bank – current account" });
  await page.fill("#amount", "3,450.75");
  // Simulate an impatient double submit before the first response arrives.
  await page.evaluate(() => {
    const f = document.querySelector("form:has(#amount)");
    f.requestSubmit();
    f.requestSubmit();
  });
  await page.getByText(/(Posted as|Already posted as) entry #\d+/).waitFor({ timeout: 10000 });
  check("treasurer can post a balanced entry", true);
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "networkidle" });
  const copies = await page.locator("article", { hasText: `E2E stationery ${stamp}` }).count();
  check("a double submit posts only once", copies === 1, `${copies} entries`);

  await page.selectOption("#debitAccountId", { label: "1100 · Bank – current account" });
  await page.selectOption("#creditAccountId", { label: "2100 · Members' ordinary savings" });
  await page.locator("#memberId").waitFor();
  check("member field appears for member accounts", true);

  await page.reload({ waitUntil: "networkidle" });
  const article = page.locator("article", { hasText: `E2E stationery ${stamp}` });
  await article.locator("summary").click();
  await article.locator("input[name=reason]").fill("E2E test reversal");
  await article.locator("button", { hasText: "Reverse" }).click();
  await page.getByText(/Reversed\. The correction is entry #\d+/).waitFor({ timeout: 10000 });
  await page.locator("article", { hasText: `E2E stationery ${stamp}` }).getByText("Reversed", { exact: true }).waitFor();
  check("entry can be reversed with a reason", (await page.getByText(/Reversal of #\d+: E2E test reversal/).count()) === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/journal.png`, fullPage: false });

  // Trial balance and audit
  await page.goto(`${BASE}/trial-balance`);
  check("trial balance balances", (await page.getByText("Debits equal credits").count()) === 1);
  const bank = await page.locator("tr", { hasText: "Bank – current account" }).locator("td").last().textContent();
  check("bank balance is correct", bank?.trim() === "393,749.50", bank?.trim());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/trial-balance.png`, fullPage: true });

  await page.goto(`${BASE}/audit`);
  check("audit chain verifies", (await page.getByText(/Chain verified/).count()) === 1);

  // Mobile layout
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/members`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("no horizontal page scroll at phone width", !overflow);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile-members.png`, fullPage: false });
} catch (e) {
  check("walkthrough completed", false, e.message.split("\n")[0]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/failure.png`, fullPage: true });
} finally {
  check("no client-side errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
