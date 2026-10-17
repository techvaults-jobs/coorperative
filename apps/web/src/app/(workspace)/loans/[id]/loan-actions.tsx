"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import type { FormState } from "../../actions";
import { disburseAction, loanDecisionAction, repayAction } from "../actions";

type Bank = { id: string; label: string };

export function DecisionPanel({ loanId, canDecide, canWithdraw, mine }: { loanId: string; canDecide: boolean; canWithdraw: boolean; mine: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loanDecisionAction, { ok: false });
  const [mode, setMode] = useState<"reject" | "withdraw" | null>(null);
  if (!canDecide && !canWithdraw) return null;
  return (
    <Card>
      <CardHeader title="Decision" description={canDecide ? "Approve or decline against the policy and the member's record." : mine ? "You recorded this, so a committee member decides it." : undefined} />
      <CardBody>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="loanId" value={loanId} />
          {mode ? (
            <>
              <Field label={mode === "reject" ? "Reason for declining" : "Reason for withdrawing"} htmlFor="reason">
                <Input id="reason" name="reason" autoFocus required />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" name="decision" value={mode} variant="danger" disabled={pending}>
                  {mode === "reject" ? "Decline" : "Withdraw"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setMode(null)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {canDecide && (
                <>
                  <Button type="submit" name="decision" value="approve" disabled={pending}>
                    {pending ? "Saving…" : "Approve loan"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setMode("reject")}>
                    Decline…
                  </Button>
                </>
              )}
              {canWithdraw && (
                <Button type="button" variant="ghost" onClick={() => setMode("withdraw")}>
                  Withdraw…
                </Button>
              )}
            </div>
          )}
          {state.message && <Alert tone="danger">{state.message}</Alert>}
        </form>
      </CardBody>
    </Card>
  );
}

export function DisbursePanel({ loanId, idempotencyKey, banks, today, fee }: { loanId: string; idempotencyKey: string; banks: Bank[]; today: string; fee: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(disburseAction, { ok: false });
  const nextMonthEnd = (() => {
    const [y, m] = today.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  })();
  return (
    <Card>
      <CardHeader title="Disburse" description={`Pays the member, less the ${fee} processing fee. Another officer approves the journal entry.`} />
      <CardBody>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="loanId" value={loanId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <Field label="Paid from" htmlFor="bankAccountId">
            <Select id="bankAccountId" name="bankAccountId">
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Disbursement date" htmlFor="disbursedOn">
              <Input id="disbursedOn" name="disbursedOn" type="date" defaultValue={today} required />
            </Field>
            <Field label="First repayment" htmlFor="firstDueDate">
              <Input id="firstDueDate" name="firstDueDate" type="date" defaultValue={nextMonthEnd} required />
            </Field>
          </div>
          {state.message && <Alert tone="danger">{state.message}</Alert>}
          <Button type="submit" disabled={pending}>
            {pending ? "Preparing…" : "Prepare disbursement"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function RepayPanel({ loanId, idempotencyKey, banks, today, suggested }: { loanId: string; idempotencyKey: string; banks: Bank[]; today: string; suggested: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(repayAction, { ok: false });
  return (
    <Card>
      <CardHeader title="Record a repayment" description="Interest due is covered first, then principal. Another officer approves the journal entry." />
      <CardBody>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="loanId" value={loanId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₦)" htmlFor="repay-amount">
              <Input id="repay-amount" name="amount" inputMode="decimal" defaultValue={suggested} className="text-right" required />
            </Field>
            <Field label="Paid on" htmlFor="paidOn">
              <Input id="paidOn" name="paidOn" type="date" defaultValue={today} required />
            </Field>
          </div>
          <Field label="Received into" htmlFor="repay-bank">
            <Select id="repay-bank" name="bankAccountId">
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          {state.message && <Alert tone="danger">{state.message}</Alert>}
          <Button type="submit" disabled={pending}>
            {pending ? "Preparing…" : "Prepare repayment"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
