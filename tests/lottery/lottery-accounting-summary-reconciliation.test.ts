// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lotteryBusinessMetrics } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessMetrics.ts";
import { lotteryExpensePeriodCost } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingExpenseBalance.ts";

import { calculateLotterySale, summarizeLotteryAccounting } from "../../vendor/foundation-lottery/runtime/lottery-accounting-core.js";
import { projectRecurringExpenseBills } from "../../vendor/foundation-lottery/runtime/accounting-expense-projection.js";
const sale = { dispatchQuantity: 5, morningReturnQuantity: 0, dayReturnQuantity: 0,
  eveningReturnQuantity: 0, ticketRatePaise: 100000, commissionPaise: 10000, tdsRateBps: 1000 };
const purchase = { grossPurchasePaise: "400000", commissionPaise: "20000", occurredAt: "2026-09-03" };
const expenseBill = { profileId: "salary", billingMonth: "2026-09", amountPaise: "30000", occurredAt: "2026-09-03" };
const expensePayment = { profileId: "salary", totalAmountPaise: "10000", cashPaise: "10000", bankPaise: "0", occurredAt: "2026-09-04" };
const customerBill = { amountPaise: "50000", occurredAt: "2026-09-03" };
const receipt = { direction: "RECEIPT", totalAmountPaise: "60000", methodSplit: { pwtPaise: "60000" }, occurredAt: "2026-09-03" };

describe("Backend and dashboard reconciliation", () => {
  it("matches accrual profit, separates expense payment and keeps TDS/PWT out of profit", () => {
    const summary = summarizeLotteryAccounting({ sales: [sale], stockistEntries: [purchase],
      expenseBills: [expenseBill], expensePayments: [expensePayment], customerBills: [customerBill], payments: [receipt] });
    const workspace = { sales: [{ ...calculateLotterySale(sale), occurredAt: "2026-09-03" }], draftSales: [],
      stockistEntries: [purchase], expenseBills: [expenseBill], expensePayments: [expensePayment],
      expenseProfiles: [], customerBills: [customerBill], payments: [receipt] };
    const ui = lotteryBusinessMetrics(workspace, "2026-09-01", "2026-09-30");
    expect(ui.profit.toString()).toBe(summary.operatingResultPaise);
    expect(summary).toMatchObject({ operatingResultPaise: "150000", expensePaise: "10000",
      paidExpensePaise: "10000", netCashFlowPaise: "-10000", pwtBalancePaise: "60000", tdsPaise: "1000" });
    expect(ui.expenses).toBe(10000n);
  });

  it("keeps held cheques and PWT separate from cash/bank/UPI flow", () => {
    const summary = summarizeLotteryAccounting({ payments: [{ direction: "RECEIPT",
      totalAmountPaise: "70000", methodSplit: { cashPaise: "10000", chequePaise: "20000", pwtPaise: "40000" } }] });
    expect(summary.netCashFlowPaise).toBe("10000");
    expect(summary.methodBalances).toMatchObject({ cashPaise: "10000", chequePaise: "20000", pwtPaise: "40000" });
    expect(summary.tdsPaise).toBe("0");
  });

  it("deducts settlement of an earlier expense in the payment period", () => {
    const summary = summarizeLotteryAccounting({ expensePayments: [expensePayment] });
    expect(summary).toMatchObject({ expensePaise: "10000", operatingResultPaise: "-10000", netCashFlowPaise: "-10000" });
  });

  it("agrees on unmaterialized monthly costs, preserves snapshots and avoids duplicates", () => {
    const profile = { id: "salary", scheduleType: "MONTHLY", usualAmountPaise: "40000", recurringStartsAt: "2026-09-03" };
    const workspace = { expenseProfiles: [profile], expenseBills: [expenseBill], expensePayments: [] };
    const projected = projectRecurringExpenseBills([profile], [expenseBill], "2026-11-04");
    const amount = projected.reduce((sum, bill) => sum + BigInt(bill.amountPaise), 0n);
    expect(amount).toBe(110000n);
    expect(lotteryExpensePeriodCost(workspace, "2026-09-01", "2026-11-04")).toBe(0n);
    expect(lotteryExpensePeriodCost(workspace, "2026-10-01", "2026-10-31")).toBe(0n);
    expect(projectRecurringExpenseBills([profile], projected, "2026-11-04")).toHaveLength(3);
  });

  it("keeps a signed voucher advance valid when nothing was collected", () => {
    const summary = summarizeLotteryAccounting({ sales: [{ ...sale, commissionPaise: 1000000 }] });
    expect(summary.netPayablePaise).toBe("-400000");
    expect(summary.anomalies).not.toContain("COLLECTION_EXCEEDS_NET_PAYABLE");
  });
});


it('reproduces the owner screenshot profit without treating stock quantities or historical balances as income',()=>{
 const workspace={sales:[],draftSales:[{occurredAt:'2026-10-31',grossSalesPaise:'3876550',commissionPaise:'0'}],stockistEntries:[{occurredAt:'2026-10-31',grossPurchasePaise:'3801600',commissionPaise:'140000'}],customerBills:[],expenseBills:[],expensePayments:[],expenseProfiles:[{id:'old',openingBalancePaise:'250000',openingBalanceDate:'2026-10-30',usualAmountPaise:'0'}],payments:[]};
 const result=lotteryBusinessMetrics(workspace,'2026-10-31','2026-10-31');
 expect(result).toMatchObject({sellerGross:3876550n,stockistGross:3801600n,stockistCommission:140000n,sellerCommission:0n,expenses:0n,profit:214950n});
 expect(result.sellerGross-result.stockistGross).toBe(74950n);
});
