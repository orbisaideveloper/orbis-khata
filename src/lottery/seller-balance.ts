import type {
  LotteryParty,
  LotteryWorkspace,
} from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { accountingBusinessDate } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate";
import { lotteryOpening } from "./opening-balance";
export function sellerDayBalance(
  workspace: LotteryWorkspace,
  party: LotteryParty,
  day: string,
  bill: bigint,
) {
  const before = (date: string) => accountingBusinessDate(date) < day;
  const receipts = workspace.payments.filter(
    (p) =>
      p.partyId === party.id &&
      p.direction === "RECEIPT" &&
      accountingBusinessDate(p.occurredAt) <= day,
  );
  const old =
    lotteryOpening(party, day) +
    [...workspace.sales, ...workspace.draftSales]
      .filter((s) => s.partyId === party.id && before(s.occurredAt))
      .reduce((sum, s) => sum + BigInt(s.netPayablePaise), 0n) -
    receipts
      .filter((p) => before(p.occurredAt))
      .reduce((sum, p) => sum + BigInt(p.totalAmountPaise), 0n);
  const received = receipts
    .filter((p) => accountingBusinessDate(p.occurredAt) === day)
    .reduce((sum, p) => sum + BigInt(p.totalAmountPaise), 0n);
  const last = [...receipts].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  )[0];
  return {
    old,
    received,
    total: old + bill,
    balance: old + bill - received,
    last,
  };
}
