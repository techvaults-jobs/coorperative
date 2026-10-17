import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { hasPermission, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function GeneralSettingsPage() {
  const ws = await requireWorkspace();
  const s = await requireSociety();
  return (
    <SettingsForm section="general" canEdit={hasPermission(ws, "settings.manage")}>
      <Card>
        <CardHeader title="Society profile" description="As registered with the Director of Co-operatives." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Registered name" htmlFor="name" className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={s.name} required />
          </Field>
          <Field label="Short name" htmlFor="shortName" hint="Shown in the sidebar and on statements, e.g. UNILAG SCS.">
            <Input id="shortName" name="shortName" defaultValue={s.shortName ?? ""} />
          </Field>
          <Field label="Registration number" htmlFor="registrationNumber">
            <Input id="registrationNumber" name="registrationNumber" defaultValue={s.registrationNumber ?? ""} className="font-mono" />
          </Field>
          <Field label="Cooperative Verification Number (CVN)" htmlFor="cvn" hint="From the National Cooperative Smart Registry, once issued.">
            <Input id="cvn" name="cvn" defaultValue={s.cvn ?? ""} className="font-mono" />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" name="state" defaultValue={s.state} required />
          </Field>
          <Field label="Registering Director of Co-operatives" htmlFor="registrar" className="sm:col-span-2">
            <Input id="registrar" name="registrar" defaultValue={s.registrar} required />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Contact" description="Shown on statements and notices." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor="address" className="sm:col-span-2">
            <Input id="address" name="address" defaultValue={s.address ?? ""} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" defaultValue={s.phone ?? ""} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={s.email ?? ""} />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Accounting" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Financial year starts in" htmlFor="financialYearStart" hint="Used for year-to-date figures, reports and the AGM pack.">
            <Select id="financialYearStart" name="financialYearStart" defaultValue={String(s.financialYearStart)}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="currency" hint="Amounts are kept in whole kobo.">
            <Input id="currency" value="Nigerian naira (₦)" readOnly disabled />
          </Field>
        </CardBody>
      </Card>
    </SettingsForm>
  );
}
