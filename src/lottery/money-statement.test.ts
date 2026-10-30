import { expect, it } from "vitest";
import type { LotteryWorkspace } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { lotteryMoneyStatement } from "./money-statement";
import { moneyFixture } from "../test/lottery-money-fixture";
it("reconciles opening, period receipts/payments and expenses using India business dates", () => {
  const cash = lotteryMoneyStatement(
    moneyFixture,
    "cashPaise",
    "2026-10-30",
    "2026-10-30",
  );
  expect(cash).toMatchObject({
    opening: 10000n,
    balance: 10000n,
    incoming: 5000n,
    outgoing: 5000n,
  });
  expect(cash.rows).toHaveLength(3);
  expect(cash.rows.find((r) => r.id === "in")).toMatchObject({
    date: "2026-10-30",
    name: "Seller",
    reference: "R1",
  });
  expect(
    lotteryMoneyStatement(
      moneyFixture,
      "bankPaise",
      "2026-10-30",
      "2026-10-30",
    ),
  ).toMatchObject({ balance: 1500n, incoming: 2000n, outgoing: 500n });
  expect(
    lotteryMoneyStatement(moneyFixture, "pwtPaise", "2026-10-30", "2026-10-30"),
  ).toMatchObject({ balance: 1000n, outgoing: 0n });
  expect(
    lotteryMoneyStatement(moneyFixture, "upiPaise", "2026-10-30", "2026-10-30")
      .rows,
  ).toEqual([]);
});
it("preserves negative closing balances and stable ordering on the same date", () => {
  const w = {
    payments: [],
    expensePayments: moneyFixture.expensePayments,
  } as unknown as LotteryWorkspace;
  expect(
    lotteryMoneyStatement(w, "cashPaise", "2026-10-30", "2026-10-30").balance,
  ).toBe(-2000n);
  const same = {
    ...moneyFixture,
    payments: [
      moneyFixture.payments[2],
      { ...moneyFixture.payments[2], id: "a" },
    ],
  };
  expect(
    lotteryMoneyStatement(
      same,
      "cashPaise",
      "2026-10-30",
      "2026-10-30",
    ).rows.map((r) => r.id),
  ).toEqual(["expense-e", "a", "out"]);
});
