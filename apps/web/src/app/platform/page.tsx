import { SECTOR_PROFILES } from "@techvaults/core";
import { listPlatformSocieties } from "@techvaults/db";
import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Table, Td, Th } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/session";

export const metadata = { title: "Societies · Staff console" };

const day = (d: Date) => d.toLocaleDateString("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" });

export default async function PlatformHome() {
  const viewer = await requirePlatformStaff();
  const societies = await listPlatformSocieties(db(), viewer.user.id);
  const active30 = societies.filter((s) => s.lastActivity && Date.now() - s.lastActivity.getTime() < 30 * 86_400_000).length;
  return (
    <>
      <PageHeader
        title="Societies"
        description="Every society on Cooperative Vaults. Staff see size and activity only; members' financial records stay private to each society."
        actions={
          <Link href="/platform/societies/new" className={buttonClass("primary")}>
            <Plus className="size-4" aria-hidden />
            Onboard a society
          </Link>
        }
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Societies" value={societies.length.toLocaleString("en-NG")} />
        <StatCard label="Members on the platform" value={societies.reduce((s, x) => s + x.members, 0).toLocaleString("en-NG")} />
        <StatCard label="Active in the last 30 days" value={active30.toLocaleString("en-NG")} />
      </section>
      {societies.length === 0 ? (
        <EmptyState icon={Building2} title="No societies yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Society</Th>
              <Th className="hidden md:table-cell">Sector</Th>
              <Th numeric>Members</Th>
              <Th numeric>Officers</Th>
              <Th className="hidden lg:table-cell">Onboarded</Th>
              <Th className="hidden sm:table-cell">Last activity</Th>
            </tr>
          </thead>
          <tbody>
            {societies.map((s) => (
              <tr key={s.id}>
                <Td>
                  <p className="font-medium">{s.shortName || s.name}</p>
                  <p className="text-muted text-xs">
                    {s.state} · {s.slug}
                  </p>
                </Td>
                <Td className="text-muted hidden md:table-cell">{SECTOR_PROFILES[s.sector].label}</Td>
                <Td numeric>{s.members.toLocaleString("en-NG")}</Td>
                <Td numeric>{s.officers}</Td>
                <Td className="text-muted hidden lg:table-cell">{day(s.createdAt)}</Td>
                <Td className="text-muted hidden sm:table-cell">{s.lastActivity ? day(s.lastActivity) : "None yet"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
