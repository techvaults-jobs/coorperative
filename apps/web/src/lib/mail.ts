import "server-only";
import { recordOutbound } from "@techvaults/db";
import { db } from "./db";

/**
 * Email. Sends through Resend when RESEND_API_KEY and MAIL_FROM are set; otherwise each message
 * is kept in the platform outbox (/platform/outbox) for staff to forward. Either way it's logged.
 */
export interface Mail {
  to: string;
  subject: string;
  /** Short kind for the log, e.g. "officer_invite". */
  kind: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote?: string;
}

export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(m: Mail): { html: string; text: string } {
  const text = [m.heading, "", ...m.paragraphs.flatMap((p) => [p, ""]), ...(m.action ? [`${m.action.label}: ${m.action.url}`, ""] : []), m.footnote ?? "", "", "Cooperative Vaults, a TechVaults product"].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f1729">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e7ed;border-radius:14px">
<tr><td style="padding:28px 32px 8px;font-size:13px;font-weight:600;color:#0d7a5f;letter-spacing:.04em;text-transform:uppercase">Cooperative Vaults</td></tr>
<tr><td style="padding:0 32px;font-size:22px;font-weight:600;line-height:1.3">${escape(m.heading)}</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.6;color:#3b4556">${m.paragraphs.map((p) => `<p style="margin:0 0 14px">${escape(p)}</p>`).join("")}</td></tr>
${m.action ? `<tr><td style="padding:8px 32px 8px"><a href="${escape(m.action.url)}" style="display:inline-block;background:#0d7a5f;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${escape(m.action.label)}</a></td></tr>
<tr><td style="padding:8px 32px 0;font-size:12px;color:#5a6577;word-break:break-all">Or copy this link: ${escape(m.action.url)}</td></tr>` : ""}
<tr><td style="padding:20px 32px 28px;font-size:12px;line-height:1.5;color:#8a94a6">${escape(m.footnote ?? "")}<br>Cooperative Vaults, a TechVaults product.</td></tr>
</table></td></tr></table></body></html>`;
  return { html, text };
}

/** Send (or hold) an email. Never throws: a failed email mustn't undo the action that triggered it. */
export async function sendMail(m: Mail): Promise<{ delivered: boolean }> {
  const { html, text } = render(m);
  if (!mailConfigured()) {
    await recordOutbound(db(), { to: m.to, subject: m.subject, kind: m.kind, status: "logged", body: text }).catch((e) => console.error("outbox", e));
    return { delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [m.to], subject: m.subject, html, text, ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(body.message ?? `Resend returned ${res.status}`);
    await recordOutbound(db(), { to: m.to, subject: m.subject, kind: m.kind, status: "sent", providerId: body.id ?? null });
    return { delivered: true };
  } catch (e) {
    console.error("mail", e);
    await recordOutbound(db(), { to: m.to, subject: m.subject, kind: m.kind, status: "failed", body: text, error: String(e) }).catch(() => {});
    return { delivered: false };
  }
}

export const appUrl = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Messages

export const mails = {
  officerInvite: (to: string, society: string, roles: string, link: string, inviter: string): Mail => ({
    to,
    kind: "officer_invite",
    subject: `You're invited to ${society} on Cooperative Vaults`,
    heading: `Join ${society}`,
    paragraphs: [`${inviter} has invited you to ${society} on Cooperative Vaults as ${roles}.`, "Use the button below to set your password. You'll then set up an authenticator app for two-factor sign-in."],
    action: { label: "Accept invitation", url: link },
    footnote: "This link works once and expires in 7 days. If you weren't expecting it, you can ignore this email.",
  }),
  memberInvite: (to: string, society: string, link: string): Mail => ({
    to,
    kind: "member_invite",
    subject: `See your ${society} account online`,
    heading: "Your member portal is ready",
    paragraphs: [`${society} has given you access to the member portal. You can see your savings, shares and loans, print statements and apply for loans.`],
    action: { label: "Set up my account", url: link },
    footnote: "This link works once and expires in 7 days. If you weren't expecting it, contact your society's secretary.",
  }),
  societyCreated: (to: string, society: string, link: string): Mail => ({
    to,
    kind: "society_onboarded",
    subject: `${society} is set up on Cooperative Vaults`,
    heading: `Welcome to Cooperative Vaults`,
    paragraphs: [`${society} has been set up on Cooperative Vaults, and you've been invited as its secretary.`, "Once you've set your password, you can configure the society, import your member register and invite the other officers."],
    action: { label: "Get started", url: link },
    footnote: "This link works once and expires in 7 days.",
  }),
  passwordReset: (to: string, link: string): Mail => ({
    to,
    kind: "password_reset",
    subject: "Reset your Cooperative Vaults password",
    heading: "Reset your password",
    paragraphs: ["Someone asked to reset the password for this account. If it was you, use the button below within the next hour."],
    action: { label: "Choose a new password", url: link },
    footnote: "If you didn't ask for this, you can ignore this email; your password won't change.",
  }),
  loanDecision: (to: string, society: string, product: string, amount: string, approved: boolean, reason: string | null, link: string): Mail => ({
    to,
    kind: "loan_decision",
    subject: approved ? `Your ${product} has been approved` : `Update on your ${product} application`,
    heading: approved ? "Your loan has been approved" : "Your loan application was not approved",
    paragraphs: approved
      ? [`${society}'s loan committee has approved your ${product} of ${amount}. The treasurer will arrange the payment, and your repayment schedule will appear in the member portal.`]
      : [`${society}'s loan committee did not approve your ${product} application of ${amount}.`, ...(reason ? [`Reason given: ${reason}`] : []), "You can speak to the secretary or treasurer about what to do next."],
    action: { label: "View in the member portal", url: link },
  }),
};
