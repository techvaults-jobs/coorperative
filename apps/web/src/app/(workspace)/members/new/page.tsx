import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { AddMemberForm } from "../add-member-form";

export const metadata = { title: "Add member" };

export default async function NewMemberPage() {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "members.write")) return <EmptyState title="Your role can't add members." />;
  const { terminology } = await requireSociety();
  return (
    <>
      <PageHeader back={{ href: "/members", label: "Members" }} title="Add a member" description={`Create a register entry. The member number and ${terminology.externalId.toLowerCase()} must be unique within the society.`} />
      <Card className="max-w-3xl">
        <CardHeader title="Member details" description="Fields marked * are required." />
        <CardBody>
          <AddMemberForm terms={terminology} />
        </CardBody>
      </Card>
    </>
  );
}
