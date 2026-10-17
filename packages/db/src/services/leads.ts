/** Demo requests from the public website. */
import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { demoRequests, users } from "../schema.js";

export class LeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadError";
  }
}

export interface LeadInput {
  name: string;
  society: string;
  role?: string;
  email: string;
  phone?: string;
  sector?: string;
  members?: string;
  message?: string;
}

const clip = (v: string | undefined, n: number) => (v?.trim() ? v.trim().slice(0, n) : null);

export async function recordDemoRequest(db: Database, input: LeadInput): Promise<void> {
  const name = input.name.trim();
  const society = input.society.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new LeadError("Tell us your name.");
  if (society.length < 3) throw new LeadError("Tell us your society's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LeadError("Enter an email we can reply to.");
  // A simple brake on floods: at most five requests from one email a day.
  const [{ n }] = (await db.execute<{ n: number }>(
    sql`select count(*)::int as n from demo_requests where email = ${email} and created_at > now() - interval '1 day'`,
  )) as unknown as [{ n: number }];
  if (Number(n) >= 5) throw new LeadError("We've already received your request. We'll be in touch.");
  await db.insert(demoRequests).values({
    name: name.slice(0, 120),
    society: society.slice(0, 200),
    role: clip(input.role, 80),
    email: email.slice(0, 200),
    phone: clip(input.phone, 40),
    sector: clip(input.sector, 40),
    members: clip(input.members, 40),
    message: clip(input.message, 2000),
  });
}

/** Recent demo requests, for TechVaults platform staff only. */
export async function listDemoRequests(db: Database, userId: string) {
  const [user] = await db.select({ staff: users.isPlatformStaff }).from(users).where(eq(users.id, userId));
  if (!user?.staff) return null;
  return db.select().from(demoRequests).orderBy(desc(demoRequests.createdAt)).limit(500);
}
