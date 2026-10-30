import type { LotteryWorkspace } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { accountingBusinessDate } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate";
export const lotteryMoneyMethods = [
  ["cashPaise", "Cash"],
  ["bankPaise", "Bank"],
  ["pwtPaise", "PWD"],
  ["upiPaise", "UPI"],
  ["chequePaise", "Cheque"],
] as const;
export type LotteryMoneyMethod = (typeof lotteryMoneyMethods)[number][0];
function expenseMethodAmount(
  payment: LotteryWorkspace["expensePayments"][number],
  method: LotteryMoneyMethod,
) {
  if (method === "cashPaise") return BigInt(payment.cashPaise);
  if (method === "bankPaise") return BigInt(payment.bankPaise);
  return 0n;
}
export function lotteryMoneyStatement(
  workspace: LotteryWorkspace,
  method: LotteryMoneyMethod,
  from: string,
  to: string,
) {
  const party = workspace.payments.map((p) => ({
    id: p.id,
    date: accountingBusinessDate(p.occurredAt),
    name: p.partyName,
    reference: p.reference,
    amount:
      BigInt(p.methodSplit[method] ?? "0") *
      (p.direction === "RECEIPT" ? 1n : -1n),
  }));
  const expenses = workspace.expensePayments.map((p) => ({
    id: "expense-" + p.id,
    date: accountingBusinessDate(p.occurredAt),
    name: p.profileName,
    reference: p.reference,
    amount: -expenseMethodAmount(p, method),
  }));
  const events = [...party, ...expenses]
    .filter((p) => p.amount !== 0n && p.date <= to)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.reference.localeCompare(b.reference, undefined, { numeric: true }) ||
        a.id.localeCompare(b.id),
    );
  let opening = 0n,
    balance = 0n,
    incoming = 0n,
    outgoing = 0n;
  const rows = [];
  for (const event of events) {
    balance += event.amount;
    if (event.date < from) {
      opening = balance;
      continue;
    }
    if (event.amount > 0n) incoming += event.amount;
    else outgoing -= event.amount;
    rows.push({ ...event, balance });
  }
  return { rows, opening, balance, incoming, outgoing };
}
