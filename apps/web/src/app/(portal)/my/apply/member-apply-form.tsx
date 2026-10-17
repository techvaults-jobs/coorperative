"use client";

import { formatNaira, kobo } from "@techvaults/core/browser";
import { CheckCircle2, XCircle } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { applyOwnLoan, previewOwnLoan, type MemberApplyState, type MemberPreview } from "../actions";

type Product = { id: string; label: string; summary: string; guarantors: number; minTerm: number; maxTerm: number };
const money = (s: string) => formatNaira(kobo(BigInt(s)));

export function MemberApplyForm({ products }: { products: Product[] }) {
  const [state, action, pending] = useActionState<MemberApplyState, FormData>(applyOwnLoan, { ok: false });
  const [productId, setProductId] = useState(products[0]!.id);
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState(String(Math.min(12, products[0]!.maxTerm)));
  const [guarantorNos, setGuarantorNos] = useState<string[]>([]);
  const [preview, setPreview] = useState<MemberPreview | null>(null);
  const [checking, startCheck] = useTransition();
  const product = products.find((p) => p.id === productId)!;

  useEffect(() => {
    const t = setTimeout(() => {
      startCheck(async () => {
        const r = await previewOwnLoan({ productId, amount, termMonths: Number(term), guarantorNos });
        setPreview("error" in r ? null : r);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [productId, amount, term, guarantorNos]);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader title="Your request" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Loan" htmlFor="productId" hint={product.summary} className="sm:col-span-2">
              <Select id="productId" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (₦)" htmlFor="amount">
              <Input id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-right" required />
            </Field>
            <Field label="Repay over (months)" htmlFor="termMonths">
              <Input id="termMonths" name="termMonths" type="number" min={product.minTerm} max={product.maxTerm} value={term} onChange={(e) => setTerm(e.target.value)} required />
            </Field>
            <Field label="What is it for?" htmlFor="purpose" className="sm:col-span-2">
              <Textarea id="purpose" name="purpose" rows={2} required />
            </Field>
          </CardBody>
        </Card>
        {product.guarantors > 0 && (
          <Card>
            <CardHeader title="Guarantors" description="Enter their member numbers. Ask them first; the committee will contact them." />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: product.guarantors }, (_, i) => {
                const found = preview?.guarantors.find((g) => g.memberNo === (guarantorNos[i] ?? "").trim().toUpperCase());
                return (
                  <Field
                    key={i}
                    label={`Guarantor ${i + 1} member no.`}
                    htmlFor={`g-${i}`}
                    hint={found ? (found.name ? `✓ ${found.name}` : "No active member with that number") : undefined}
                  >
                    <Input
                      id={`g-${i}`}
                      name="guarantorNos"
                      value={guarantorNos[i] ?? ""}
                      onChange={(e) => setGuarantorNos((g) => Object.assign([...g], { [i]: e.target.value }))}
                      className="font-mono uppercase"
                    />
                  </Field>
                );
              })}
            </CardBody>
          </Card>
        )}
        {state.message && <Alert tone="danger">{state.message}</Alert>}
      </div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-32 lg:h-fit">
        <Card>
          <CardHeader title="Do I qualify?" description={checking ? "Checking…" : preview ? (preview.eligible ? "Yes, on every rule" : "Not yet") : "Fill in the amount to check"} />
          <CardBody>
            {preview && (
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
            )}
            {preview?.payment && (
              <dl className="border-border mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                <div>
                  <dt className="text-muted text-xs">Monthly payment</dt>
                  <dd className="font-semibold tabular-nums">{money(preview.payment)}</dd>
                </div>
                <div>
                  <dt className="text-muted text-xs">Total to repay</dt>
                  <dd className="font-semibold tabular-nums">{money(preview.totalRepayable!)}</dd>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>
        <Button type="submit" size="lg" disabled={pending || !preview?.eligible}>
          {pending ? "Sending…" : "Send application"}
        </Button>
      </aside>
    </form>
  );
}
