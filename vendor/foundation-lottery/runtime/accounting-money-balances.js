import { businessDateKey } from "./accounting-business-date.js";
const ACCOUNTING_PAYMENT_METHODS = Object.freeze([
  "cashPaise", "bankPaise", "upiPaise", "chequePaise", "pwtPaise",
]);

function paymentMethodBalance(payments, method, expensePayments = []) {
  const posted = payments.reduce((balance, payment) => {
    const amount = BigInt(payment.methodSplit?.[method] || 0);
    return balance + (payment.direction === "RECEIPT" ? amount : -amount);
  }, 0n);
  return posted - expensePayments.reduce((total, payment) =>
    total + BigInt(payment[method] || 0), 0n);
}

function accountingMoneyBalances(payments, expensePayments = []) {
  return Object.fromEntries(ACCOUNTING_PAYMENT_METHODS.map((method) =>
    [method, paymentMethodBalance(payments, method, expensePayments)]));
}

function visiblePaymentRows(payments, clearances) {
  return payments.filter((payment) => !clearances.some((clearance) =>
    (clearance.scope === "ALL" || clearance.scope === "PAYMENT") &&
    businessDateKey(clearance.occurredAt) === businessDateKey(payment.occurredAt) &&
    new Date(payment.updatedAt || payment.createdAt || 0) <= new Date(clearance.createdAt)));
}

function nonnegativePwt(payments) {
  const days = new Map();
  for (const payment of payments) {
    const day = businessDateKey(payment.occurredAt);
    const amount = BigInt(payment.methodSplit?.pwtPaise || 0);
    const signed = payment.direction === "RECEIPT" ? amount : -amount;
    days.set(day, (days.get(day) || 0n) + signed);
  }
  let balance = 0n;
  for (const [, amount] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    balance += amount;
    if (balance < 0n) return false;
  }
  return true;
}

export { nonnegativePwt, paymentMethodBalance, accountingMoneyBalances, visiblePaymentRows };

