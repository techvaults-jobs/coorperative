import { listOutbound } from "@techvaults/db";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { db } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { requirePlatformStaff } from "@/lib/session";

export const metadata = { title: "Email outbox · Staff console" };

export default async function OutboxPage() {
  const viewer = await requirePlatformStaff();
  const messages = await listOutbound(db(), viewer.user.id);
  if (!messages) notFound();
  return (
    <>
      <PageHeader title="Email outbox" description="Every email the platform has sent, or is holding because email isn't set up." />
      {!mailConfigured() && (
        <Alert tone="warning" title="Email isn't set up">
          Set RESEND_API_KEY and MAIL_FROM on the server to send automatically. Until then, messages are held here; forward the link inside each one by hand.
        </Alert>
      )}
      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>To</Th>
            <Th>Subject</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id}>
              <Td className="whitespace-nowrap">{m.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}</Td>
              <Td className="break-all">{m.to}</Td>
              <Td>
                {m.subject}
                {m.body && (
                  <details className="mt-1">
                    <summary className="text-accent cursor-pointer text-xs">Show message</summary>
                    <pre className="bg-surface-2 mt-2 max-w-xl overflow-x-auto rounded-lg p-3 text-xs whitespace-pre-wrap">{m.body}</pre>
                  </details>
                )}
                {m.error && <p className="text-danger text-xs">{m.error}</p>}
              </Td>
              <Td>
                <Badge tone={m.status === "sent" ? "good" : m.status === "failed" ? "danger" : "warning"} dot>
                  {m.status === "sent" ? "Sent" : m.status === "failed" ? "Failed" : "Held"}
                </Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
