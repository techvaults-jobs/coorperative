"use client";

import { CheckCircle2, Download, FileUp } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { balancesImportAction, loansImportAction, membersImportAction, type ImportState } from "./actions";

/** Upload → preview with every problem listed → import, for members or opening balances. */
export function ImportWizard({ kind, templateHref, intro, defaultDate }: { kind: "members" | "balances" | "loans"; templateHref: string; intro: string; defaultDate?: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(kind === "members" ? membersImportAction : kind === "loans" ? loansImportAction : balancesImportAction, { ok: false, step: "preview" });

  if (state.step === "done") {
    return (
      <Card className="max-w-2xl">
        <CardBody className="flex flex-col items-start gap-4">
          <span className="bg-success-soft text-success flex size-11 items-center justify-center rounded-full">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <p className="font-medium">{state.message}</p>
          <div className="flex gap-2">
            <Link href={kind === "members" ? "/members/import?tab=balances" : "/approvals"} className={buttonClass("primary")}>
              {kind === "members" ? "Next: opening balances" : "Open approvals"}
            </Link>
            <Link href="/members" className={buttonClass("secondary")}>
              Back to members
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={kind === "members" ? "Upload the member register" : kind === "loans" ? "Upload running loans" : "Upload opening balances"}
          description={intro}
          actions={
            <a href={templateHref} className={buttonClass("secondary", undefined, "sm")} download>
              <Download className="size-4" aria-hidden />
              Template (CSV)
            </a>
          }
        />
        <CardBody>
          <form action={action} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
            <Field label="File" htmlFor={`${kind}-file`} hint="CSV, as saved from Excel or Google Sheets (2 MB at most).">
              <Input id={`${kind}-file`} name="file" type="file" accept=".csv,text/csv" className="py-1.5" />
            </Field>
            {kind !== "members" ? (
              <Field label="Balances as at" htmlFor="asOf">
                <Input id="asOf" name="asOf" type="date" defaultValue={defaultDate} required />
              </Field>
            ) : (
              <div />
            )}
            <Field label="Or paste it" htmlFor={`${kind}-csv`} className="lg:col-span-2">
              <Textarea id={`${kind}-csv`} name="csv" rows={4} className="font-mono text-xs" />
            </Field>
            <div className="lg:col-span-2">
              <Button type="submit" variant="secondary" disabled={pending}>
                <FileUp className="size-4" aria-hidden />
                {pending ? "Checking…" : "Check file"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {state.message && <Alert tone="danger">{state.message}</Alert>}

      {state.csv && (
        <Card>
          <CardHeader title="Preview" description={state.summary} />
          <CardBody className="flex flex-col gap-4">
            {state.issues && state.issues.length > 0 && (
              <Alert tone="warning" title={`${state.issues.length} problem${state.issues.length === 1 ? "" : "s"} to fix in the file, then check it again`}>
                <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4 text-xs">
                  {state.issues.map((i, n) => (
                    <li key={n}>
                      {i.line > 1 ? `Line ${i.line}: ` : ""}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            {state.rows && state.rows.length > 0 && (
              <div className="border-border max-h-96 overflow-auto rounded-lg border">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-surface-2 text-muted sticky top-0">
                    <tr>
                      {state.headers!.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((r, i) => (
                      <tr key={i} className="border-border border-t">
                        {r.map((c, j) => (
                          <td key={j} className="px-3 py-1.5 whitespace-nowrap">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {state.ok && (
              <form action={action} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="commit" value="1" />
                <input type="hidden" name="csv" value={state.csv} />
                {kind !== "members" && <input type="hidden" name="asOf" value={state.asOf ?? defaultDate} />}
                <Button type="submit" disabled={pending}>
                  {pending ? "Working…" : kind === "members" ? "Import members" : kind === "loans" ? "Bring loans across" : "Prepare opening balances entry"}
                </Button>
                <span className="text-muted text-xs">{kind === "members" ? "Everyone in the preview is added at once." : "Another officer approves the entry."}</span>
              </form>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
