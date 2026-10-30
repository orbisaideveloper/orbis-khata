type TdsRule = { from: string; rateBps: number };
export type PaymentOptions = {
  upi: boolean;
  cheque: boolean;
  bankChannels: string[];
};
export type OrganizationRules = {
  tdsRateBps?: number;
  tdsBaseRateBps?: number;
  tdsRules?: TdsRule[];
  paymentOptions?: PaymentOptions;
};
export function validRuleDay(day: unknown): day is string {
  return (
    typeof day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(day) &&
    !Number.isNaN(Date.parse(day + "T00:00:00Z")) &&
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day
  );
}
export function tdsRateOn(org: OrganizationRules, day: string) {
  const rules = (org.tdsRules ?? [])
    .filter((r) => r.from <= day)
    .sort((a, b) => b.from.localeCompare(a.from));
  return rules[0]?.rateBps ?? org.tdsBaseRateBps ?? org.tdsRateBps ?? 200;
}
export function scheduledTds(
  org: OrganizationRules,
  from: unknown,
  rate: unknown,
) {
  if (
    !validRuleDay(from) ||
    typeof rate !== "number" ||
    !Number.isInteger(rate) ||
    rate < 0 ||
    rate > 10000
  )
    throw new Error("INVALID_TDS_RULE");
  return {
    tdsBaseRateBps: org.tdsBaseRateBps ?? org.tdsRateBps ?? 200,
    tdsRules: [
      ...(org.tdsRules ?? []).filter((r) => r.from !== from),
      { from, rateBps: rate },
    ].sort((a, b) => a.from.localeCompare(b.from)),
  };
}
export function paymentOptions(value: unknown): PaymentOptions {
  if (value === undefined)
    return { upi: false, cheque: false, bankChannels: [] };
  const p = value as PaymentOptions;
  if (
    !p ||
    typeof p.upi !== "boolean" ||
    typeof p.cheque !== "boolean" ||
    !Array.isArray(p.bankChannels) ||
    p.bankChannels.length > 20 ||
    p.bankChannels.some(
      (s) => typeof s !== "string" || !s.trim() || s.length > 60,
    ) ||
    new Set(p.bankChannels.map((s) => s.trim().toLocaleLowerCase())).size !==
      p.bankChannels.length
  )
    throw new Error("INVALID_PAYMENT_OPTIONS");
  return {
    upi: p.upi,
    cheque: p.cheque,
    bankChannels: p.bankChannels.map((s) => s.trim()),
  };
}
