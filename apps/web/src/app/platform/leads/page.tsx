import { listDemoRequests } from "@techvaults/db";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { Table, Td, Th } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo requests" };

/** Demo requests from the website, for TechVaults platform staff only. */
export default async function LeadsPage() {
  const viewer = await requireViewer();
  const leads = await listDemoRequests(db(), viewer.user.id);
  if (!leads) notFound();
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demo requests</h1>
        <p className="text-muted text-sm">{leads.length} from the website, newest first.</p>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Received</Th>
            <Th>Contact</Th>
            <Th>Society</Th>
            <Th>Message</Th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap">{l.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}</Td>
              <Td>
                <p className="font-medium">{l.name}</p>
                <p className="text-muted text-xs">{[l.role, l.email, l.phone].filter(Boolean).join(" · ")}</p>
              </Td>
              <Td>
                <p>{l.society}</p>
                <p className="text-muted text-xs">{[l.sector, l.members && `${l.members} members`].filter(Boolean).join(" · ")}</p>
              </Td>
              <Td className="text-muted max-w-md text-sm whitespace-pre-wrap">{l.message ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </main>
  );
}
