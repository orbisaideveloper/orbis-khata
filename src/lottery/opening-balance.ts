import type { LotteryParty } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
/** Positive means due in the party's normal direction; negative means advance. */
export function lotteryOpening(
  party: LotteryParty | undefined,
  through: string,
): bigint {
  return party?.openingBalanceDate && party.openingBalanceDate <= through
    ? BigInt(party.openingBalancePaise ?? "0")
    : 0n;
}
