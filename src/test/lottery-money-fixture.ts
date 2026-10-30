import type { LotteryWorkspace } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
export const moneyFixture = {
  payments: [
    {
      id: "before",
      partyName: "Old",
      reference: "old",
      occurredAt: "2026-10-28",
      direction: "RECEIPT",
      methodSplit: { cashPaise: "10000" },
    },
    {
      id: "in",
      partyName: "Seller",
      reference: "R1",
      occurredAt: "2026-10-29T20:00:00Z",
      direction: "RECEIPT",
      methodSplit: { cashPaise: "5000", bankPaise: "2000", pwtPaise: "1000" },
    },
    {
      id: "out",
      partyName: "Stockist",
      reference: "P1",
      occurredAt: "2026-10-30",
      direction: "PAYMENT",
      methodSplit: { cashPaise: "3000" },
    },
    {
      id: "future",
      partyName: "Future",
      reference: "F",
      occurredAt: "2026-10-31",
      direction: "RECEIPT",
      methodSplit: { cashPaise: "999999" },
    },
  ],
  expensePayments: [
    {
      id: "e",
      profileName: "Wages",
      reference: "E1",
      occurredAt: "2026-10-30",
      cashPaise: "2000",
      bankPaise: "500",
    },
  ],
} as unknown as LotteryWorkspace;
