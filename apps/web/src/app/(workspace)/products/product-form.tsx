"use client";

import { INTEREST_METHOD_LABELS, INTEREST_METHODS, type LoanPolicy, type SavingsPolicy, type SharesPolicy } from "@techvaults/core/browser";
import type { ProductKind } from "@techvaults/db";
import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { koboToNairaInput } from "@/lib/policy-form";
import type { FormState } from "../actions";
import { saveProduct } from "./actions";

type Account = { id: string; label: string };

export function ProductForm({
  kind,
  productId,
  policy,
  accounts,
  incomeAccounts,
}: {
  kind: ProductKind;
  productId?: string;
  policy: LoanPolicy | SavingsPolicy | SharesPolicy;
  accounts: Account[];
  incomeAccounts: Account[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProduct, { ok: false });
  const loan = kind === "loan" ? (policy as LoanPolicy) : null;
  const savings = kind === "savings" ? (policy as SavingsPolicy) : null;
  const shares = kind === "shares" ? (policy as SharesPolicy) : null;
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="kind" value={kind} />
      {productId && <input type="hidden" name="productId" value={productId} />}
      {!productId && (
        <Card>
          <CardHeader title="Product" description="How members and officers will recognise it." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required placeholder={kind === "loan" ? "e.g. Regular loan" : kind === "savings" ? "e.g. Ordinary savings" : "e.g. Ordinary shares"} />
            </Field>
            <Field label="Code" htmlFor="code" hint="2–12 letters, digits or dashes.">
              <Input id="code" name="code" required className="font-mono uppercase" placeholder={kind === "loan" ? "REG-LOAN" : kind === "savings" ? "ORD-SAV" : "ORD-SHR"} />
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2">
              <Textarea id="description" name="description" rows={2} />
            </Field>
            <Field label="Member account" htmlFor="accountId" hint="Where members' balances for this product are kept.">
              <Select id="accountId" name="accountId" required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
            {kind === "loan" && (
              <Field label="Income account" htmlFor="incomeAccountId" hint="Credited with interest and processing fees.">
                <Select id="incomeAccountId" name="incomeAccountId" required>
                  {incomeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Policy" description="Takes effect only when another officer approves it. Existing loans keep the terms they were granted under." />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loan && (
            <>
              <Field label="Interest method" htmlFor="interestMethod" className="sm:col-span-2 lg:col-span-3">
                <Select id="interestMethod" name="interestMethod" defaultValue={loan.interestMethod}>
                  {INTEREST_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {INTEREST_METHOD_LABELS[m].label}: {INTEREST_METHOD_LABELS[m].description}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Annual interest rate (%)" htmlFor="annualRate">
                <Input id="annualRate" name="annualRate" inputMode="decimal" defaultValue={String(loan.annualRateBps / 100)} required />
              </Field>
              <Field label="Shortest term (months)" htmlFor="minTermMonths">
                <Input id="minTermMonths" name="minTermMonths" type="number" min={1} max={120} defaultValue={loan.minTermMonths} required />
              </Field>
              <Field label="Longest term (months)" htmlFor="maxTermMonths">
                <Input id="maxTermMonths" name="maxTermMonths" type="number" min={1} max={120} defaultValue={loan.maxTermMonths} required />
              </Field>
              <Field label="Smallest loan (₦)" htmlFor="minAmount">
                <Input id="minAmount" name="minAmount" inputMode="decimal" defaultValue={koboToNairaInput(loan.minAmount)} required />
              </Field>
              <Field label="Largest loan (₦)" htmlFor="maxAmount">
                <Input id="maxAmount" name="maxAmount" inputMode="decimal" defaultValue={koboToNairaInput(loan.maxAmount)} required />
              </Field>
              <Field label="Savings multiple" htmlFor="savingsMultiple" hint="e.g. 2 = up to twice savings. Blank for no limit.">
                <Input id="savingsMultiple" name="savingsMultiple" inputMode="decimal" defaultValue={loan.savingsMultiple ?? ""} />
              </Field>
              <Field label="Guarantors required" htmlFor="guarantorsRequired">
                <Input id="guarantorsRequired" name="guarantorsRequired" type="number" min={0} max={5} defaultValue={loan.guarantorsRequired} required />
              </Field>
              <Field label="Processing fee (%)" htmlFor="processingFee" hint="Deducted from the amount paid out.">
                <Input id="processingFee" name="processingFee" inputMode="decimal" defaultValue={String(loan.processingFeeBps / 100)} />
              </Field>
              <Field label="Minimum membership (months)" htmlFor="minMembershipMonths">
                <Input id="minMembershipMonths" name="minMembershipMonths" type="number" min={0} max={120} defaultValue={loan.minMembershipMonths} required />
              </Field>
              <Field label="Running loans allowed" htmlFor="maxActiveLoans">
                <Input id="maxActiveLoans" name="maxActiveLoans" type="number" min={1} max={10} defaultValue={loan.maxActiveLoans} required />
              </Field>
            </>
          )}
          {savings && (
            <>
              <Field label="Minimum contribution (₦)" htmlFor="minimumContribution">
                <Input id="minimumContribution" name="minimumContribution" inputMode="decimal" defaultValue={koboToNairaInput(savings.minimumContribution)} />
              </Field>
              <Field label="Withdrawal notice (days)" htmlFor="withdrawalNoticeDays">
                <Input id="withdrawalNoticeDays" name="withdrawalNoticeDays" type="number" min={0} max={365} defaultValue={savings.withdrawalNoticeDays} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
                <input type="checkbox" name="withdrawable" defaultChecked={savings.withdrawable} className="accent-accent size-4" />
                Members may withdraw while still members
              </label>
            </>
          )}
          {shares && (
            <>
              <Field label="Share price (₦)" htmlFor="sharePrice">
                <Input id="sharePrice" name="sharePrice" inputMode="decimal" defaultValue={koboToNairaInput(shares.sharePrice)} required />
              </Field>
              <Field label="Minimum shares held" htmlFor="minimumShares">
                <Input id="minimumShares" name="minimumShares" type="number" min={0} defaultValue={shares.minimumShares} />
              </Field>
              <p className="text-muted self-end pb-2.5 text-xs">No member may hold more than 1/5 of all shares (Act s.27). This is enforced, not configurable.</p>
            </>
          )}
        </CardBody>
      </Card>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Link href="/products" className={buttonClass("secondary")}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </form>
  );
}
