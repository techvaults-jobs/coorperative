// End-to-end walkthrough of a freshly seeded deployment: sign-in, two-factor setup, members,
// maker-checker journal entries (including double-submit protection), inviting an approver,
// approval, rejection, reversal, officer management, trial balance and audit chain.
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
const errors = [];
function watch(p) {
  p.on("pageerror", (e) => errors.push(`${p.url()}: ${e.message.slice(0, Number(process.env.ERR_LEN ?? 160))}`));
  p.on("console", (m) => {
    if (process.env.ERR_LEN && m.type() === "error") errors.push(`${p.url()} console: ${m.text().slice(0, Number(process.env.ERR_LEN))}`);
  });
  if (process.env.DEBUG_AUTH) {
    p.on("response", async (r) => {
      if (r.url().includes("/api/auth/")) console.log("AUTH", r.status(), r.url().replace(BASE, ""), (await r.text().catch(() => "")).slice(0, 200));
    });
  }
  return p;
}
const page = watch(await browser.newPage({ viewport: { width: 1280, height: 860 } }));

/** Turn on two-factor from the Security page and continue to the society. Returns the secret. */
async function setUpTwoFactor(p, password) {
  await p.fill("#password", password);
  await p.click("button[type=submit]");
  const secret = (await p.locator("code").first().textContent()).trim();
  await p.fill("#code", totp(secret));
  await p.click("button[type=submit]");
  // Two-factor checks are rate-limited per IP; every browser in this test shares one.
  const outcome = await Promise.race([
    p.getByText("Two-factor authentication is on.").waitFor({ timeout: 10000 }).then(() => "on"),
    p.getByText("Too many attempts").waitFor({ timeout: 10000 }).then(() => "limited"),
  ]);
  if (outcome === "limited") {
    check("rate-limited two-factor attempts say so", true);
    await p.waitForTimeout(11_000);
    await p.fill("#code", totp(secret));
    await p.click("button[type=submit]");
    await p.getByText("Two-factor authentication is on.").waitFor({ timeout: 10000 });
  }
  await p.getByRole("button", { name: "Continue", exact: true }).click();
  await p.waitForURL(/\/overview/, { timeout: 15000 });
  return secret;
}

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
    secret = await setUpTwoFactor(page, PASSWORD);
    check("two-factor set up with authenticator code", true);
    console.log(`TOTP_SECRET=${secret}`);
  } else if (page.url().includes("/sign-in/verify")) {
    await page.fill("#code", totp(secret));
    await page.click("button[type=submit]");
  }
  await page.waitForURL(/\/overview/, { timeout: 15000 });
  check("overview opens after sign-in", true);
  // The checks below use the staff society's seeded figures.
  const society = page.locator("aside select#society").first();
  if (await society.count()) {
    const staff = await society.locator("option", { hasText: "Staff" }).getAttribute("value");
    if ((await society.inputValue()) !== staff) {
      await Promise.all([page.waitForURL(/\/overview/), society.selectOption(staff)]);
      await page.waitForLoadState("networkidle");
    }
    check("society switcher changes society", (await page.getByText("Demo Staff Cooperative").count()) > 0);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true });

  // Sign out and back in: two-factor must now be asked for
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
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
  await page.goto(`${BASE}/members/new`, { waitUntil: "networkidle" });
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
  await page.getByRole("heading", { name: "Balances" }).waitFor({ state: "attached" });
  const loan = await page.getByText("₦150,000.00", { exact: true }).count();
  check("member page shows balances from the ledger", loan > 0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/member.png`, fullPage: true });

  // Journal: prepare, double-submit; nothing posts until someone else approves
  await page.goto(`${BASE}/ledger`, { waitUntil: "networkidle" });
  const lastNo = Number((await page.locator("article .font-mono.text-xs").first().textContent()).replace("#", ""));
  // ⌘K finds a member and opens their page
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  await page.keyboard.type("Chiamaka");
  await page.getByRole("option", { name: /Chiamaka Eze/ }).waitFor({ timeout: 5000 });
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: /Chiamaka Eze/ }).click();
  await page.waitForURL(/\/members\/[0-9a-f-]{36}/);
  check("command palette finds a member", true);
  const prepare = async (description, amount) => {
    await page.goto(`${BASE}/ledger/new`, { waitUntil: "networkidle" });
    await page.fill("#description", description);
    await page.selectOption("#debitAccountId", { label: "5200 · Stationery and printing" });
    await page.selectOption("#creditAccountId", { label: "1100 · Bank – current account" });
    await page.fill("#amount", amount);
  };
  await prepare(`E2E stationery ${stamp}`, "3,450.75");
  // Simulate an impatient double submit before the first response arrives.
  await page.evaluate(() => {
    const f = document.querySelector("form:has(#amount)");
    f.requestSubmit();
    f.requestSubmit();
  });
  await page.getByText(/Submitted for approval|Already submitted/).waitFor({ timeout: 10000 });
  check("treasurer can submit a balanced entry for approval", true);
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/ledger`, { waitUntil: "networkidle" });
  check("a submitted entry is not in the journal yet", (await page.locator("article", { hasText: `E2E stationery ${stamp}` }).count()) === 0);
  check("journal says entries are waiting", (await page.getByText(/waiting for approval and not yet in the journal/).count()) === 1);

  await page.goto(`${BASE}/ledger/new`, { waitUntil: "networkidle" });
  await page.selectOption("#debitAccountId", { label: "1100 · Bank – current account" });
  await page.selectOption("#creditAccountId", { label: "2100 · Members' ordinary savings" });
  await page.locator("#memberId").waitFor();
  check("member field appears for member accounts", true);

  await prepare(`E2E wrong amount ${stamp}`, "99");
  await page.click("form:has(#amount) button[type=submit]");
  await page.getByText("Submitted for approval").waitFor({ timeout: 10000 });

  await page.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
  const mine = page.locator("article", { hasText: `E2E stationery ${stamp}` });
  check("a double submit creates only one submission", (await mine.count()) === 1, `${await mine.count()} submissions`);
  check("the preparer can't approve their own entry", (await mine.getByRole("button", { name: "Approve and post" }).count()) === 0 && (await mine.getByRole("button", { name: "Withdraw" }).count()) === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/approvals-preparer.png`, fullPage: true });

  // Invite a chairperson to approve
  await page.goto(`${BASE}/officers`, { waitUntil: "networkidle" });
  const chairEmail = `chair.e2e.${stamp}@example.ng`;
  await page.fill("#invite-email", chairEmail);
  await page.check("#invite-chairperson");
  await page.click("form:has(#invite-email) button[type=submit]");
  const link = await page.locator("#invite-link").inputValue({ timeout: 10000 });
  check("secretary can create an invitation link", link.includes("/invite/"));
  await page.reload({ waitUntil: "networkidle" });
  check("open invitation is listed", (await page.locator("tr", { hasText: chairEmail }).count()) === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/officers.png`, fullPage: true });

  const chairContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const chair = watch(await chairContext.newPage());
  const chairPassword = `e2e-chair-${stamp}-passphrase`;
  await chair.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  await chair.getByRole("heading", { name: "Set up your account" }).waitFor();
  await chair.fill("#name", "E2E Chairperson");
  await chair.fill("#password", chairPassword);
  await chair.fill("#confirm", "something else entirely");
  await chair.click("button[type=submit]");
  await chair.getByText("don't match").waitFor();
  check("mismatched passwords are refused, keeping the name", (await chair.inputValue("#name")) === "E2E Chairperson");
  await chair.fill("#password", chairPassword);
  await chair.fill("#confirm", chairPassword);
  await chair.click("button[type=submit]");
  await chair.waitForURL(/\/security\?required=1/, { timeout: 15000 });
  check("invited officer creates an account and is sent to two-factor setup", true);
  await setUpTwoFactor(chair, chairPassword);
  check("invited officer reaches the society after two-factor", (await chair.getByText("Chairperson").count()) > 0);

  // Approve one, reject the other
  await chair.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
  await chair.locator("article", { hasText: `E2E stationery ${stamp}` }).getByRole("button", { name: "Approve and post" }).click();
  await chair.getByText(/Approved and posted as entry #\d+/).waitFor({ timeout: 10000 });
  const postedNo = Number((await chair.getByText(/Approved and posted as entry #\d+/).textContent()).match(/#(\d+)/)[1]);
  check("approval posts with the next number, no gaps", postedNo === lastNo + 1, `#${lastNo} then #${postedNo}`);
  const wrong = chair.locator("article", { hasText: `E2E wrong amount ${stamp}` });
  await wrong.getByRole("button", { name: "Reject…" }).click();
  await wrong.locator("input[name=reason]").fill("Amount should be 9,900");
  await wrong.getByRole("button", { name: "Reject", exact: true }).click();
  await chair.getByText("Rejected. The preparer can see your reason").waitFor({ timeout: 10000 });
  check("approver can reject with a reason", (await chair.getByText("Reason: Amount should be 9,900").count()) === 1);
  if (SHOTS) await chair.screenshot({ path: `${SHOTS}/approvals-approver.png`, fullPage: true });
  await chair.goto(`${BASE}/officers`, { waitUntil: "networkidle" });
  check("a chairperson can't manage officers", (await chair.getByText("doesn't include managing officers").count()) === 1);

  // Request a reversal; the approver posts it
  await page.goto(`${BASE}/ledger`, { waitUntil: "networkidle" });
  const article = page.locator("article", { hasText: `E2E stationery ${stamp}` });
  check("approved entry shows who prepared and approved it", (await article.getByText("approved by E2E Chairperson").count()) === 1);
  await article.locator("summary").click();
  await article.locator("input[name=reason]").fill("E2E test reversal");
  await article.locator("button", { hasText: "Request reversal" }).click();
  await page.getByText("Reversal requested.").waitFor({ timeout: 10000 });
  await page.locator("article", { hasText: `E2E stationery ${stamp}` }).getByText("Reversal awaiting approval").waitFor();
  await chair.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
  await chair.locator("article", { hasText: "E2E test reversal" }).getByRole("button", { name: "Approve and post" }).click();
  await chair.getByText(/Approved and posted as entry #\d+/).waitFor({ timeout: 10000 });
  await page.goto(`${BASE}/ledger`, { waitUntil: "networkidle" });
  await page.locator("article", { hasText: `E2E stationery ${stamp}` }).first().getByText("Reversed", { exact: true }).waitFor();
  check("entry is reversed once the reversal is approved", (await page.getByText(new RegExp(`Reversal of #${postedNo}: E2E test reversal`)).count()) === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/journal.png`, fullPage: false });

  // The invitation link works only once
  const reuse = watch(await (await browser.newContext()).newPage());
  await reuse.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  check("an invitation link can't be used twice", (await reuse.getByText("already been used").count()) === 1);
  await reuse.close();

  // Trial balance and audit
  await page.goto(`${BASE}/trial-balance`);
  check("trial balance balances", (await page.getByText("Debits equal credits").count()) === 1);
  const bank = await page.locator("tr", { hasText: "Bank – current account" }).locator("td").last().textContent();
  check("bank balance is correct", bank?.trim() === "393,749.50", bank?.trim());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/trial-balance.png`, fullPage: true });

  await page.goto(`${BASE}/audit`);
  check("audit chain verifies", (await page.getByText(/Chain verified/).count()) === 1);

  // Removing an officer takes effect on their next request
  await page.goto(`${BASE}/officers`, { waitUntil: "networkidle" });
  const row = page.locator("tr", { hasText: chairEmail });
  await row.locator("summary").click();
  await row.locator("input[name=reason]").fill("E2E test finished");
  await row.getByRole("button", { name: /Remove .* access/ }).click();
  await page.getByText("Access removed.").waitFor({ timeout: 10000 });
  await chair.goto(`${BASE}/overview`, { waitUntil: "networkidle" });
  check("a removed officer loses access at once", chair.url().includes("/no-society"));
  await chairContext.close();

  // Configuration: the society's own words and colour
  await page.goto(`${BASE}/settings/sector`, { waitUntil: "networkidle" });
  await page.fill("#group", "Faculty or unit");
  await page.click("form button[type=submit]");
  await page.getByText("Saved.").waitFor({ timeout: 10000 });
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle" });
  const headers = await page.locator("thead th").allInnerTexts();
  check("the society's own words label the register", headers.some((h) => h.toLowerCase() === "faculty or unit"), headers.join("|"));
  await page.goto(`${BASE}/settings/branding`, { waitUntil: "networkidle" });
  await page.fill("#brandColor", "#ffe066");
  await page.click("form button[type=submit] >> text=Save changes");
  await page.getByText("too light").waitFor({ timeout: 10000 });
  check("a brand colour too light for white text is refused", true);
  await page.getByRole("radio", { name: "Royal" }).click();
  await page.click("form button[type=submit] >> text=Save changes");
  await page.getByText("Saved.").waitFor({ timeout: 10000 });
  const accent = await page.evaluate(() => getComputedStyle(document.querySelector("main")).getPropertyValue("--accent").trim());
  check("the society's brand colour themes the workspace", accent === "#5b3fbf", accent);

  // Mobile layout
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/members`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("no horizontal page scroll at phone width", !overflow);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile-members.png`, fullPage: false });
} catch (e) {
  check("walkthrough completed", false, e.message.split("\n")[0]);
  if (SHOTS) {
    const open = browser.contexts().flatMap((c) => c.pages());
    for (const [i, p] of open.entries()) await p.screenshot({ path: `${SHOTS}/failure-${i}.png`, fullPage: true }).catch(() => {});
  }
} finally {
  check("no client-side errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
