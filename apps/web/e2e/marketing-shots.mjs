// Captures product screenshots for the marketing homepage from a freshly seeded local copy.
//   node e2e/marketing-shots.mjs http://localhost:3123 public/marketing
// Run against a fresh seed with REQUIRE_TWO_FACTOR=false. Images show synthetic demo data only.
import { chromium } from "playwright";

const [BASE, OUT] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", deviceScaleFactor: 1 });
const page = await ctx.newPage();
const shot = async (name) => {
  await page.waitForTimeout(700); // let the fade-in finish
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
};

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill("#email", process.env.EMAIL ?? "admin@demo.techvaults.local");
await page.fill("#password", process.env.PASSWORD ?? "local-e2e-admin-pass");
await page.click("button[type=submit]");
await page.waitForURL(/overview/);
await page.waitForLoadState("networkidle");

// Farmers' society (the default): dashboard, a loan, the balance sheet.
await shot("dashboard");
await page.goto(`${BASE}/loans?tab=active`, { waitUntil: "networkidle" });
await page.click("tbody tr a >> nth=0");
await page.waitForLoadState("networkidle");
await shot("loan");
await page.goto(`${BASE}/reports/position`, { waitUntil: "networkidle" });
await shot("reports");

// Staff society: a reconciled payroll month.
const society = page.locator("aside select#society").first();
const staff = await society.locator("option", { hasText: "Staff" }).getAttribute("value");
await Promise.all([page.waitForURL(/overview/), society.selectOption(staff)]);
await page.goto(`${BASE}/payroll`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Build schedule" }).click();
await page.waitForURL(/\/payroll\/[0-9a-f-]{36}/);
await page.getByRole("button", { name: "Freeze and send to employer" }).click();
await page.getByText("Schedule frozen.").waitFor();
const runUrl = page.url().split("?")[0];
const csv = (await (await page.request.get(`${runUrl}/schedule.csv`)).text()).replace(/^﻿/, "");
const rows = csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
const remittance = ["Staff ID,Name,Amount", ...rows.map(([id, name, , , , , total], i) => `${id},${name},${i === 2 ? (Number(total) - 2500).toFixed(2) : total}`), "DS/9999,Unknown,1500.00"].join("\n");
await page.fill("#csv", remittance);
await page.getByRole("button", { name: "Load and reconcile" }).click();
await page.getByText("Remittance loaded and reconciled.").waitFor();
await page.goto(runUrl, { waitUntil: "networkidle" });
await page.evaluate(() => {
  const h = document.getElementById("recon-heading");
  if (h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 90);
});
await shot("payroll");

// Member portal: invite a member and sign in as them.
await page.goto(`${BASE}/members?q=Funmilayo`, { waitUntil: "networkidle" });
await page.click("text=Funmilayo Ogunleye");
await page.waitForURL(/\/members\/[0-9a-f-]{36}/);
await page.fill("#portal-email", "funmilayo.demo@example.ng");
await page.getByRole("button", { name: "Create invitation link" }).click();
const link = await page.locator("#member-invite-link").inputValue();
const memberCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, colorScheme: "light" });
const member = await memberCtx.newPage();
await member.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
await member.fill("#name", "Funmilayo Ogunleye");
await member.fill("#password", "demo-member-passphrase-1");
await member.fill("#confirm", "demo-member-passphrase-1");
await member.click("button[type=submit]");
await member.waitForURL(/\/my$/);
await member.waitForTimeout(800);
await member.screenshot({ path: `${OUT}/portal.png` });
console.log("saved portal");

await browser.close();
