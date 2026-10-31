import { scheduledTds, paymentOptions } from "./organization-rules.ts";
import { savePartyOpening } from "./party-opening.ts";
import {
  createLotteryAccountingService,
  serialize,
} from "../../vendor/foundation-lottery/runtime/lottery-accounting-service.js";
import {
  createLotteryStore,
  decodeLottery,
  encodeLottery,
  type LotteryState,
} from "./domain-store.ts";
import { lotteryInput, type LotteryInput } from "./protocol.ts";
export { lotteryInput, type LotteryInput } from "./protocol.ts";
export async function runLottery(
  state: unknown,
  input: LotteryInput,
  owner: string,
  clock = () => new Date(),
) {
  if (!lotteryInput(input)) throw new Error("LOTTERY_INPUT_INVALID");
  const store = createLotteryStore(
    decodeLottery(state ?? {}) as LotteryState,
    clock,
  );
  const service = createLotteryAccountingService({
    prisma: store.client,
    now: clock,
  });
  // Original cloud/device preference is honored by the copied local projection.
  const result = await store.client.$transaction(async () => {
    if (
      input.method === "updateOrganizationPreferences" ||
      (input.method === "updateOrganizationTdsRate" &&
        input.payload.effectiveFrom !== undefined)
    ) {
      return saveOrganizationRules(store.client, input, owner);
    }
    if (input.method === "recordPayment" && input.payload.bankChannel) {
      if (typeof input.payload.bankChannel !== "string")
        throw new Error("INVALID_BANK_CHANNEL");
      const org =
        await store.client.foundationAccountingOrganization.findUnique({
          where: { id: input.payload.organizationId },
        });
      if (
        !paymentOptions(org?.paymentOptions).bankChannels.includes(
          String(input.payload.bankChannel),
        )
      )
        throw new Error("INVALID_BANK_CHANNEL");
    }
    const result = await service[input.method](input.payload, owner);
    if (input.method === "recordPayment" && input.payload.bankChannel) {
      await store.client.foundationLotteryPayment.update({
        where: { id: result.payment.id },
        data: { bankChannel: input.payload.bankChannel },
      });
      result.payment.bankChannel = input.payload.bankChannel;
    }
    if (
      input.method === "createParty" ||
      input.method === "updatePartyProfile"
    ) {
      await savePartyOpening(store.client, result.id, input.payload, owner);
      return store.client.foundationAccountingParty.findUnique({
        where: { id: result.id },
      });
    }
    return result;
  });
  return { result: serialize(result), state: encodeLottery(store.snapshot()), changes: store.changes() };
}

async function saveOrganizationRules(
  client: ReturnType<typeof createLotteryStore>["client"],
  input: LotteryInput,
  owner: string,
) {
  if (
    typeof input.payload.organizationId !== "string" ||
    !input.payload.organizationId.trim()
  )
    throw new Error("ORGANIZATION_NOT_FOUND");
  const organization = await client.foundationAccountingOrganization.findUnique(
    {
      where: { id: input.payload.organizationId },
    },
  );
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  const data =
    input.method === "updateOrganizationPreferences"
      ? { paymentOptions: paymentOptions(input.payload.paymentOptions) }
      : scheduledTds(
          organization,
          input.payload.effectiveFrom,
          input.payload.tdsRateBps,
        );
  await client.foundationLotteryAuditEvent.create({
    data: {
      organizationId: organization.id,
      eventType: input.method,
      entityType: "ORGANIZATION",
      entityId: organization.id,
      actorAdminId: owner,
      metadata: { before: organization, change: data },
    },
  });
  return client.foundationAccountingOrganization.update({
    where: { id: organization.id },
    data,
  });
}
