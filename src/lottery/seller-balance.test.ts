import { expect, it } from "vitest";
import type {
  LotteryParty,
  LotteryWorkspace,
} from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { lotteryOpening } from "./opening-balance";
import { sellerDayBalance } from "./seller-balance";
it("separates previous due, today bill/receipts, future entries and advances exactly", () => {
  const party = {
    id: "seller",
    openingBalancePaise: "50000",
    openingBalanceDate: "2026-10-28",
  } as LotteryParty;
  const payment = (
    id: string,
    date: string,
    amount: string,
    direction = "RECEIPT",
  ) => ({
    id,
    partyId: "seller",
    occurredAt: date,
    totalAmountPaise: amount,
    direction,
  });
  const workspace = {
    sales: [
      { partyId: "seller", occurredAt: "2026-10-29", netPayablePaise: "20000" },
      {
        partyId: "seller",
        occurredAt: "2026-10-30",
        netPayablePaise: "100000",
      },
      { partyId: "other", occurredAt: "2026-10-29", netPayablePaise: "99999" },
    ],
    draftSales: [],
    payments: [
      payment("old", "2026-10-29", "20000"),
      payment("today", "2026-10-29T20:00:00Z", "90000"),
      payment("future", "2026-10-31", "90000"),
      payment("wrong", "2026-10-30", "999", "PAYMENT"),
    ],
  } as unknown as LotteryWorkspace;
  expect(
    sellerDayBalance(workspace, party, "2026-10-30", 100000n),
  ).toMatchObject({
    old: 50000n,
    received: 90000n,
    total: 150000n,
    balance: 60000n,
    last: { id: "today" },
  });
  expect(lotteryOpening(party, "2026-10-27")).toBe(0n);
  expect(lotteryOpening(undefined, "2026-10-30")).toBe(0n);
  expect(
    lotteryOpening({ ...party, openingBalancePaise: undefined }, "2026-10-30"),
  ).toBe(0n);
  expect(
    sellerDayBalance(
      { ...workspace, sales: [], payments: [] },
      { ...party, openingBalancePaise: "-10000" },
      "2026-10-30",
      0n,
    ).balance,
  ).toBe(-10000n);
});
