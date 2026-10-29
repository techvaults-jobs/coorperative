import { formatNaira, nextMeetingDate, WEEKDAYS } from "@techvaults/core";
import { listCollectionSheets, meetingWeekday } from "@techvaults/db";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { ROW_HOVER, Table, Td, Th } from "@/components/ui/table";
import { COLLECTION_STATUS, meetingLabel } from "@/lib/collection-status";
import { hasPermission, inSociety, requireWorkspace } from "@/lib/session";
import { MeetingDayForm, OpenSheetForm } from "./forms";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const ws = await requireWorkspace();
  const canManage = hasPermission(ws, "collections.manage");
  if (!canManage && !hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include collections." />;
  const { sheets, weekday } = await inSociety(ws, async (tx) => ({ sheets: await listCollectionSheets(tx, ws.actor), weekday: await meetingWeekday(tx, ws.actor) }));
  const today = new Date().toISOString().slice(0, 10);
  // Suggest the latest meeting day that has already happened and has no sheet yet.
  let suggested = today;
  if (weekday !== null) {
    const back = new Date(`${nextMeetingDate(weekday, today)}T00:00:00Z`);
    if (back.toISOString().slice(0, 10) > today) back.setUTCDate(back.getUTCDate() - 7);
    suggested = back.toISOString().slice(0, 10);
  }
  const taken = sheets.some((s) => s.meetingDate === suggested);

  return (
    <>
      <PageHeader
        title="Collections"
        description="One sheet per meeting: what each member paid into savings, shares, loan repayment and interest. The treasurer checks it against the cash counted and transfers, and another officer approves the posting."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-3" aria-label="Meetings">
          {sheets.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No meetings recorded yet.">
              Open a sheet for your last meeting. It comes pre-filled with each member&apos;s usual contributions and what&apos;s due on their loans.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Meeting</Th>
                  <Th numeric>Members paid</Th>
                  <Th numeric>Recorded</Th>
                  <Th numeric className="hidden sm:table-cell">
                    Received
                  </Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr key={s.id} className={ROW_HOVER}>
                    <Td>
                      <Link href={`/collections/${s.id}`} className="text-accent font-medium hover:underline">
                        {meetingLabel(s.meetingDate)}
                      </Link>
                    </Td>
                    <Td numeric>{s.paidMembers}</Td>
                    <Td numeric>{formatNaira(s.total)}</Td>
                    <Td numeric className="hidden sm:table-cell">
                      {s.received === null ? "—" : formatNaira(s.received)}
                    </Td>
                    <Td>
                      <Badge tone={COLLECTION_STATUS[s.status]!.tone} dot>
                        {COLLECTION_STATUS[s.status]!.label}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
        {canManage && (
          <div className="flex flex-col gap-6">
            <Card className="h-fit">
              <CardHeader title="Open a meeting" description="Pre-filled from usual contributions and loan amounts due. Correct it to what was actually paid." />
              <CardBody>
                <OpenSheetForm defaultDate={taken ? "" : suggested} max={today} />
              </CardBody>
            </Card>
            <Card className="h-fit">
              <CardHeader
                title="Meeting day"
                description={weekday === null ? "Not set: a sheet can be dated any day." : `Sheets can only be dated on a ${WEEKDAYS[weekday]}, so a date can't be typed wrongly.`}
              />
              <CardBody>
                <MeetingDayForm current={weekday} />
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
