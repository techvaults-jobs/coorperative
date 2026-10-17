/** The record of emails sent (or held for forwarding when no provider is configured). */
import { desc } from "drizzle-orm";
import type { Database } from "../client.js";
import { outboundMessages } from "../schema.js";
import { isPlatformStaff } from "./platform.js";

export interface OutboundRecord {
  to: string;
  subject: string;
  kind: string;
  status: "sent" | "logged" | "failed";
  body?: string | null;
  error?: string | null;
  providerId?: string | null;
}

export async function recordOutbound(db: Database, m: OutboundRecord): Promise<void> {
  await db.insert(outboundMessages).values({
    to: m.to,
    subject: m.subject.slice(0, 300),
    kind: m.kind,
    status: m.status,
    // Keep the body only if it wasn't delivered, so staff can forward it.
    body: m.status === "sent" ? null : (m.body ?? null),
    error: m.error?.slice(0, 1000) ?? null,
    providerId: m.providerId ?? null,
  });
}

export async function listOutbound(db: Database, userId: string) {
  if (!(await isPlatformStaff(db, userId))) return null;
  return db.select().from(outboundMessages).orderBy(desc(outboundMessages.createdAt)).limit(300);
}
