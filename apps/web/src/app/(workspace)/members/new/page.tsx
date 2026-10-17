import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, requireWorkspace } from "@/lib/session";
import { AddMemberForm } from "../add-member-form";

export const metadata = { title: "Add member" };

export default async function NewMemberPage() {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "members.write")) return <EmptyState title="Your role can't add members." />;
  return (
    <>
      <PageHeader back={{ href: "/members", label: "Members" }} title="Add a member" description="Create a register entry. The member number and staff ID must be unique within the society." />
      <Card className="max-w-3xl">
        <CardHeader title="Member details" description="Fields marked * are required. Staff ID is used to match payroll deductions." />
        <CardBody>
          <AddMemberForm />
        </CardBody>
      </Card>
    </>
  );
}
