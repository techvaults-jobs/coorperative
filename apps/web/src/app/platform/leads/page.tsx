import { listDemoRequests } from "@techvaults/db";
import { notFound } from "next/navigation";
import { Table, Td, Th } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/session";

export const metadata = { title: "Demo requests · Staff console" };

/** Demo requests from the website, for TechVaults platform staff only. */
export default async function LeadsPage() {
  const viewer = await requirePlatformStaff();
  const leads = await listDemoRequests(db(), viewer.user.id);
  if (!leads) notFound();
  return (
    <>
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
    </>
  );
}
