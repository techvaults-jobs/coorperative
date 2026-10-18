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
  // Import: a member register pasted from a spreadsheet
  await page.goto(`${BASE}/members/import`, { waitUntil: "networkidle" });
  await page.fill("#members-csv", `Member no,Full name,Staff ID,Department,Joined\nIMP-${stamp}-1,Ngozi Obi,IMP/${stamp}/1,Library,05/01/2024\nIMP-${stamp}-2,Sule Hassan,IMP/${stamp}/2,Works,`);
  await page.getByRole("button", { name: "Check file" }).click();
  await page.getByText("2 members ready").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Import members" }).click();
  await page.getByText("2 members added to the register.").waitFor({ timeout: 15000 });
  check("a member register imports from a spreadsheet", true);
  await page.goto(`${BASE}/members/import?tab=loans`, { waitUntil: "networkidle" });
  await page.fill("#loans-csv", `Member no,Product code,Outstanding,Remaining months,Next due date\nIMP-${stamp}-1,REG-LOAN,24000,6,30/11/2026`);
  await page.getByRole("button", { name: "Check file" }).click();
  await page.getByText("1 loans,").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Bring loans across" }).click();
  await page.getByText(/running loans .* prepared/).waitFor({ timeout: 15000 });
  check("a running loan is brought across for approval", true);

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
    await page.selectOption("#line-0-account", { label: "5200 · Stationery and printing" });
    await page.fill("#line-0-debit", amount);
    await page.selectOption("#line-1-account", { label: "1100 · Bank – current account" });
    await page.fill("#line-1-credit", amount);
  };
  await prepare(`E2E stationery ${stamp}`, "3,450.75");
  // Simulate an impatient double submit before the first response arrives.
  await page.evaluate(() => {
    const f = document.querySelector("form:has(#line-0-account)");
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
  await page.selectOption("#line-0-account", { label: "1100 · Bank – current account" });
  await page.selectOption("#line-1-account", { label: "2100 · Members' ordinary savings" });
  await page.locator("#line-1-member").waitFor();
  check("member field appears for member accounts", true);

  // A three-line entry: refused while it doesn't balance, accepted once it does.
  await prepare(`E2E wrong amount ${stamp}`, "99");
  await page.fill("#line-1-credit", "90");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.selectOption("#line-2-account", { label: "4100 · Entrance fees" });
  check("an unbalanced entry shows how far out it is", (await page.getByText("Out by ₦9.00").count()) === 1);
  await page.click("form:has(#line-0-account) button[type=submit]");
  await page.getByText("Enter an amount on this line, or remove it.").waitFor({ timeout: 10000 });
  await page.fill("#line-2-credit", "5");
  await page.click("form:has(#line-0-account) button[type=submit]");
  await page.getByText("Debits and credits must be equal").waitFor({ timeout: 10000 });
  check("an unbalanced entry is refused", true);
  await page.fill("#line-2-credit", "9");
  await page.getByText("✓ Balanced").waitFor();
  await page.click("form:has(#line-0-account) button[type=submit]");
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

  // Loans: eligibility-checked application, committee decision, disbursement through journal approval
  await page.goto(`${BASE}/loans/new`, { waitUntil: "networkidle" });
  await page.selectOption("#memberId", { label: "DSC-0001 · Adaeze Okonkwo" });
  await page.selectOption("#productId", { label: "Regular loan" });
  await page.fill("#amount", "90000");
  await page.fill("#termMonths", "6");
  await page.fill("#purpose", `E2E loan ${stamp}`);
  await page.selectOption("#guarantor-0", { label: "DSC-0002 · Babatunde Adeyemi" });
  await page.getByText("Doesn't meet the product's rules yet").waitFor({ timeout: 10000 });
  check("loan eligibility flags an amount over the savings limit", (await page.getByText("At most 3× savings").count()) === 1);
  await page.fill("#amount", "50000");
  await page.getByText("Meets every rule of the product").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Record application" }).click();
  await page.waitForURL(/\/loans\/[0-9a-f-]{36}/, { timeout: 15000 });
  const loanUrl = page.url();
  check("officer records an eligible loan application", (await page.getByText("Application recorded").count()) === 1);
  check("the officer who recorded it can't approve it", (await page.getByRole("button", { name: "Approve loan" }).count()) === 0);
  await chair.goto(loanUrl, { waitUntil: "networkidle" });
  await chair.getByRole("button", { name: "Approve loan" }).click();
  await chair.getByText("Approved. The treasurer can now prepare the disbursement.").waitFor({ timeout: 10000 });
  check("a committee member approves the loan", true);
  await page.goto(loanUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Prepare disbursement" }).click();
  await page.getByText("Disbursement prepared.").waitFor({ timeout: 10000 });
  await chair.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
  await chair.locator("article", { hasText: "disbursement – DSC-0001" }).getByRole("button", { name: "Approve and post" }).click();
  await chair.getByText(/Approved and posted as entry #\d+/).waitFor({ timeout: 10000 });
  await page.goto(loanUrl, { waitUntil: "networkidle" });
  const outstanding = await page.locator("div", { hasText: /^Principal outstanding/ }).locator("p.text-2xl").first().textContent();
  check("disbursed loan is active with its full balance outstanding", (await page.getByText("Active", { exact: true }).count()) > 0 && outstanding === "₦50,000.00", outstanding ?? "");
  check("the loan has a repayment schedule", (await page.locator("tbody tr").count()) === 6);

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
  // Seeded ₦393,749.50, less the loan paid out (₦50,000 less its 1% processing fee).
  check("bank balance is correct", bank?.trim() === "344,249.50", bank?.trim());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/trial-balance.png`, fullPage: true });

  await page.goto(`${BASE}/audit`);
  check("audit chain verifies", (await page.getByText(/Chain verified/).count()) === 1);

  // Reports agree with the ledger
  await page.goto(`${BASE}/reports/position`, { waitUntil: "networkidle" });
  check("statement of financial position balances", (await page.getByText("✓ Assets equal liabilities plus members' funds.").count()) === 1);
  const positionCsv = await page.request.get(`${BASE}/reports/export?report=position`);
  check("reports download as CSV", positionCsv.ok() && (await positionCsv.text()).includes("Accumulated surplus"));
  await page.goto(`${BASE}/reports/income?from=2026-01-01&to=2026-12-31`, { waitUntil: "networkidle" });
  check("income statement shows the statutory reserve", (await page.getByText("Statutory reserve, 25% of surplus (Act s.34)").count()) === 1);
  await page.goto(`${BASE}/reports/year-end`, { waitUntil: "networkidle" });
  check("the year-end close page previews the reserve transfer", (await page.getByText("25% to the statutory reserve fund (Act s.34)").count()) === 1);
  await page.goto(`${BASE}/members?q=Chiamaka`, { waitUntil: "networkidle" });
  await page.click("text=Chiamaka Eze");
  await page.getByRole("link", { name: "Statement" }).click();
  await page.waitForURL(/\/statement/);
  check("member statement shows the loan balance", (await page.getByText(/Closing balance\s*₦150,000.00/).count()) === 1);

  // Payroll: schedule → employer CSV → remittance with a shortfall and an unknown ID → posting approved
  await page.goto(`${BASE}/payroll`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Build schedule" }).click();
  await page.waitForURL(/\/payroll\/[0-9a-f-]{36}/, { timeout: 15000 });
  const runUrl = page.url().split("?")[0];
  check("payroll schedule is built from contributions", (await page.locator("tbody tr").count()) === 10);
  await page.getByRole("button", { name: "Freeze and send to employer" }).click();
  await page.getByText("Schedule frozen.").waitFor({ timeout: 10000 });
  const csvRes = await page.request.get(`${runUrl}/schedule.csv`);
  const scheduleCsv = (await csvRes.text()).replace(/^\uFEFF/, "");
  check("employer schedule downloads as CSV", csvRes.ok() && scheduleCsv.startsWith("Staff ID,Name,Member no."), scheduleCsv.slice(0, 40));
  const csvRows = scheduleCsv.trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
  const remittance = ["Staff ID,Name,Amount", ...csvRows.map(([id, name, , , , , total], i) => `${id},${name},${i === 0 ? (Number(total) - 1000).toFixed(2) : total}`), "XX/0000,Unknown Person,750.00"].join("\n");
  await page.fill("#csv", remittance);
  await page.getByRole("button", { name: "Load and reconcile" }).click();
  await page.getByText("Remittance loaded and reconciled.").waitFor({ timeout: 15000 });
  check("reconciliation flags a short deduction", (await page.locator("tbody tr", { hasText: "Short" }).count()) === 1);
  check("an unknown ID is listed as unidentified", (await page.getByText("XX/0000").count()) === 1);
  await page.getByRole("button", { name: "Submit for posting" }).click();
  await page.getByText("Posting prepared.").waitFor({ timeout: 15000 });
  await chair.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
  await chair.locator("article", { hasText: "Payroll deductions" }).getByRole("button", { name: "Approve and post" }).click();
  await chair.getByText(/Approved and posted as entry #\d+/).waitFor({ timeout: 15000 });
  await page.goto(runUrl, { waitUntil: "networkidle" });
  check("approved payroll run is posted", (await page.getByText("Posted", { exact: true }).count()) > 0);

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

  // Member portal: invited from the member page, sees only their own records
  await page.goto(`${BASE}/members?q=Funmilayo`, { waitUntil: "networkidle" });
  await page.click("text=Funmilayo Ogunleye");
  await page.waitForURL(/\/members\/[0-9a-f-]{36}/);
  await page.fill("#portal-email", `member.e2e.${stamp}@example.ng`);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const memberLink = await page.locator("#member-invite-link").inputValue({ timeout: 10000 });
  const memberContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const member = watch(await memberContext.newPage());
  await member.goto(memberLink.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  await member.fill("#name", "Funmilayo Ogunleye");
  await member.fill("#password", `e2e-member-${stamp}-passphrase`);
  await member.fill("#confirm", `e2e-member-${stamp}-passphrase`);
  await member.click("button[type=submit]");
  await member.waitForURL(/\/my$/, { timeout: 15000 });
  check("an invited member lands in their portal without two-factor setup", true);
  // ₦45,000 seeded, plus ₦22,500 from the payroll month posted earlier in this walkthrough.
  check("the member sees their own savings", (await member.getByText("My ordinary savings").count()) === 1 && (await member.getByText("₦67,500.00").count()) > 0);
  if (SHOTS) await member.screenshot({ path: `${SHOTS}/portal-home.png`, fullPage: true });
  await member.goto(`${BASE}/members`, { waitUntil: "networkidle" });
  check("a member can't open the officers' register", member.url().endsWith("/my"));
  await member.goto(`${BASE}/my/statement?from=2026-01-01`, { waitUntil: "networkidle" });
  check("the member downloads their own statement", (await member.getByText(/Statement · Funmilayo Ogunleye/).count()) > 0);
  await member.goto(`${BASE}/my/apply`, { waitUntil: "networkidle" });
  check("the member can start a loan application", (await member.getByText("Do I qualify?").count()) === 1);
  await member.goto(`${BASE}/my/withdraw`, { waitUntil: "networkidle" });
  await member.fill("#amount", "5000");
  await member.fill("#reason", "E2E withdrawal");
  await member.getByRole("button", { name: "Send request" }).click();
  await member.getByText("Request sent.").waitFor({ timeout: 10000 });
  check("a member asks to withdraw savings from the portal", true);
  await page.goto(`${BASE}/withdrawals?tab=decide`, { waitUntil: "networkidle" });
  check("officers see the request awaiting a decision", (await page.locator("text=E2E withdrawal").count()) === 1);
  await memberContext.close();

  // Staff console: onboard a society; email is held in the outbox when no provider is set up
  if (process.env.STAFF_EMAIL) {
    await new Promise((r) => setTimeout(r, 11_000)); // sign-in attempts share one rate-limit bucket locally
    const staffContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const staff = watch(await staffContext.newPage());
    await staff.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await staff.fill("#email", process.env.STAFF_EMAIL);
    await staff.fill("#password", process.env.STAFF_PASSWORD);
    await staff.click("button[type=submit]");
    await staff.waitForURL(/\/(security|platform)/, { timeout: 15000 });
    if (staff.url().includes("/security")) {
      await setUpTwoFactor(staff, process.env.STAFF_PASSWORD).catch(() => {});
      await staff.goto(`${BASE}/platform`, { waitUntil: "networkidle" });
    }
    check("platform staff reach the staff console", (await staff.getByRole("heading", { name: "Societies" }).count()) === 1);
    await staff.goto(`${BASE}/platform/societies/new`, { waitUntil: "networkidle" });
    await staff.fill("#name", `E2E Transport Union Cooperative ${stamp}`);
    await staff.fill("#state", "Oyo");
    await staff.fill("#registrar", "Oyo State Director of Co-operatives");
    await staff.selectOption("#sector", { label: "Transport" });
    await staff.fill("#secretaryEmail", `secretary.${stamp}@example.ng`);
    await staff.getByRole("button", { name: "Create society and invitation" }).click();
    await staff.locator("#secretary-link").waitFor({ timeout: 15000 });
    check("staff onboard a new society with a secretary invitation", (await staff.locator("#secretary-link").inputValue()).includes("/invite/"));

    // Password reset: the portal member asks for a link; with no email provider it's held in the outbox.
    const resetter = watch(await (await browser.newContext()).newPage());
    await resetter.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
    await resetter.fill("#email", `member.e2e.${stamp}@example.ng`);
    await resetter.getByRole("button", { name: "Send reset link" }).click();
    await resetter.getByText("Check your email").waitFor({ timeout: 10000 });
    await staff.goto(`${BASE}/platform/outbox`, { waitUntil: "networkidle" });
    const resetRow = staff.locator("tr", { hasText: `member.e2e.${stamp}@example.ng` }).filter({ hasText: "Reset your" });
    await resetRow.locator("summary").click();
    const body = await resetRow.locator("pre").textContent();
    const resetUrl = body.match(/https?:\/\/\S+reset-password\S+/)?.[0];
    check("password reset email is held in the outbox", !!resetUrl);
    await resetter.goto(resetUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
    await resetter.fill("#password", `new-member-pass-${stamp}`);
    await resetter.fill("#confirm", `new-member-pass-${stamp}`);
    await resetter.getByRole("button", { name: "Change password" }).click();
    await resetter.getByText("Your password has been changed.").waitFor({ timeout: 10000 });
    await new Promise((r) => setTimeout(r, 11_000));
    await resetter.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await resetter.fill("#email", `member.e2e.${stamp}@example.ng`);
    await resetter.fill("#password", `new-member-pass-${stamp}`);
    await resetter.click("button[type=submit]");
    await resetter.waitForURL(/\/my$/, { timeout: 15000 });
    check("the member signs in with the new password", true);
    await staffContext.close();
  }

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
