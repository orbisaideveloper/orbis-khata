import type { LotteryWorkspace } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { accountingBusinessDate } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate";
export type CommissionSide = "seller" | "stockist";
function records(workspace: LotteryWorkspace, side: CommissionSide) {
  return side === "seller"
    ? [...workspace.sales, ...workspace.draftSales]
    : workspace.stockistEntries;
}
export function lotteryCommissionDays(
  workspace: LotteryWorkspace,
  from: string,
  to: string,
) {
  const totals = new Map<string, { stockist: bigint; seller: bigint }>();
  for (const side of ["stockist", "seller"] as const) {
    for (const row of records(workspace, side)) {
      const day = accountingBusinessDate(row.occurredAt);
      if (day < from || day > to) continue;
      const sum = totals.get(day) ?? { stockist: 0n, seller: 0n };
      sum[side] += BigInt(row.commissionPaise);
      totals.set(day, sum);
    }
  }
  const rows = [];
  const end = Date.parse(to + "T00:00:00Z");
  for (
    let date = Date.parse(from + "T00:00:00Z");
    date <= end;
    date += 86400000
  ) {
    const day = new Date(date).toISOString().slice(0, 10);
    const total = totals.get(day) ?? { stockist: 0n, seller: 0n };
    rows.push({ day, ...total, difference: total.stockist - total.seller });
  }
  return {
    rows,
    stockist: rows.reduce((sum, r) => sum + r.stockist, 0n),
    seller: rows.reduce((sum, r) => sum + r.seller, 0n),
    difference: rows.reduce((sum, r) => sum + r.difference, 0n),
  };
}
export function lotteryCommissionParties(
  workspace: LotteryWorkspace,
  side: CommissionSide,
  day: string,
) {
  const result = new Map<
    string,
    { id: string; name: string; amount: bigint; entered: boolean }
  >();
  for (const party of workspace.parties) {
    const stockist =
      party.partyType === "STOCKIST" || party.partyType === "SERVICE_STOCKIST";
    if (side === "seller" ? party.partyType === "SELLER" : stockist)
      result.set(party.id, {
        id: party.id,
        name: party.name,
        amount: 0n,
        entered: false,
      });
  }
  for (const row of records(workspace, side)) {
    if (accountingBusinessDate(row.occurredAt) !== day) continue;
    const party = result.get(row.partyId) ?? {
      id: row.partyId,
      name: row.partyName,
      amount: 0n,
      entered: false,
    };
    party.amount += BigInt(row.commissionPaise);
    party.entered = true;
    result.set(row.partyId, party);
  }
  return [...result.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
