"use client";

import { formatNaira, kobo } from "@techvaults/core/browser";
import { CheckCircle2, XCircle } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { FormState } from "../../actions";
import { applyAction, previewLoan, type Preview } from "../actions";

type Option = { id: string; label: string };
type Product = Option & { summary: string; guarantors: number; minTerm: number; maxTerm: number };

const money = (s: string) => formatNaira(kobo(BigInt(s)));

export function ApplicationForm({ members, products, initialMemberId }: { members: Option[]; products: Product[]; initialMemberId?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(applyAction, { ok: false });
  const [memberId, setMemberId] = useState(initialMemberId && members.some((m) => m.id === initialMemberId) ? initialMemberId : "");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState(String(Math.min(12, products[0]?.maxTerm ?? 12)));
  const [guarantors, setGuarantors] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, startCheck] = useTransition();
  const product = products.find((p) => p.id === productId);
  const slots = Math.max(product?.guarantors ?? 0, guarantors.length);

  useEffect(() => {
    const t = setTimeout(() => {
      startCheck(async () => {
        const r = await previewLoan({ memberId, productId, amount, termMonths: Number(term), guarantors: guarantors.filter(Boolean).length });
        setPreview("error" in r ? null : r);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [memberId, productId, amount, term, guarantors]);

  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader title="Applicant and product" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Member" htmlFor="memberId" className="sm:col-span-2">
              <Select id="memberId" name="memberId" value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
                <option value="">Choose a member…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Loan product" htmlFor="productId" hint={product?.summary} className="sm:col-span-2">
              <Select id="productId" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount requested (₦)" htmlFor="amount" error={err.amount}>
              <Input id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-right" required />
            </Field>
            <Field label="Term (months)" htmlFor="termMonths">
              <Input id="termMonths" name="termMonths" type="number" min={product?.minTerm ?? 1} max={product?.maxTerm ?? 120} value={term} onChange={(e) => setTerm(e.target.value)} required />
            </Field>
            <Field label="Purpose" htmlFor="purpose" className="sm:col-span-2">
              <Textarea id="purpose" name="purpose" rows={2} placeholder="e.g. School fees for the new session" required />
            </Field>
          </CardBody>
        </Card>
        {slots > 0 && (
          <Card>
            <CardHeader title="Guarantors" description={`This product needs ${product?.guarantors ?? 0}. Guarantors must be active members other than the applicant.`} />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: slots }, (_, i) => (
                <Field key={i} label={`Guarantor ${i + 1}`} htmlFor={`guarantor-${i}`}>
                  <Select
                    id={`guarantor-${i}`}
                    name="guarantorIds"
                    value={guarantors[i] ?? ""}
                    onChange={(e) => setGuarantors((g) => Object.assign([...g], { [i]: e.target.value }))}
                  >
                    <option value="">Choose a member…</option>
                    {members
                      .filter((m) => m.id !== memberId && (m.id === guarantors[i] || !guarantors.includes(m.id)))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                  </Select>
                </Field>
              ))}
            </CardBody>
          </Card>
        )}
        {state.message && <Alert tone="danger">{state.message}</Alert>}
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-24 xl:h-fit">
        <Card>
          <CardHeader
            title="Eligibility"
            description={checking ? "Checking…" : preview ? (preview.eligible ? "Meets every rule of the product" : "Doesn't meet the product's rules yet") : "Choose a member, product and amount"}
          />
          <CardBody>
            {preview ? (
              <ul className="flex flex-col gap-2.5" aria-live="polite">
                {preview.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2.5 text-sm">
                    {c.ok ? <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-label="Passes" /> : <XCircle className="text-danger mt-0.5 size-4 shrink-0" aria-label="Fails" />}
                    <span>
                      {c.label}
                      <span className="text-muted block text-xs">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">The checklist appears here.</p>
            )}
          </CardBody>
        </Card>
        {preview?.totalRepayable && (
          <Card>
            <CardHeader title="Repayment" description="Illustrative: the real schedule starts from the disbursement date." />
            <CardBody className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Monthly payment", money(preview.instalments[0]!.payment)],
                  ["Total interest", money(preview.totalInterest!)],
                  ["Total repayable", money(preview.totalRepayable)],
                  ["Processing fee", money(preview.fee)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted text-xs">{k}</dt>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-border max-h-56 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-surface-2 text-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">#</th>
                      <th className="px-2 py-1.5 text-right font-medium">Payment</th>
                      <th className="px-2 py-1.5 text-right font-medium">Interest</th>
                      <th className="px-2 py-1.5 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.instalments.map((i) => (
                      <tr key={i.number} className="border-border border-t">
                        <td className="px-2 py-1">{i.number}</td>
                        <td className="px-2 py-1 text-right">{money(i.payment)}</td>
                        <td className="px-2 py-1 text-right">{money(i.interest)}</td>
                        <td className="px-2 py-1 text-right">{money(i.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}
        <Button type="submit" size="lg" disabled={pending || !preview?.eligible} className={cn(!preview?.eligible && "cursor-not-allowed")}>
          {pending ? "Recording…" : "Record application"}
        </Button>
        {!preview?.eligible && preview && <p className="text-muted text-center text-xs">Fix the failing rules above to record the application.</p>}
      </aside>
    </form>
  );
}
