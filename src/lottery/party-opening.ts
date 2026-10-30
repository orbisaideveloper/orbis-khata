type Client = Record<string, any>;
function openingInput(input: Record<string, unknown>) {
  const amount = input.openingBalancePaise;
  const date = input.openingBalanceDate;
  if (
    typeof amount !== "string" ||
    !/^-?\d{1,15}$/u.test(amount) ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
    Number.isNaN(Date.parse(date + "T00:00:00Z")) ||
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date
  )
    throw new Error("INVALID_OPENING_BALANCE");
  return { openingBalancePaise: BigInt(amount), openingBalanceDate: date };
}
async function openingLedger(
  client: Client,
  party: Client,
  amount: bigint,
  date: string,
  actor: string,
  reverse = false,
) {
  if (amount === 0n) return;
  const seller = party.partyType === "SELLER" || party.partyType === "CUSTOMER";
  const debit = (seller === amount > 0n) !== reverse;
  const transactionId = crypto.randomUUID();
  const common = {
    organizationId: party.organizationId,
    transactionId,
    sourceType: "PARTY_OPENING",
    sourceId: party.id,
    amountPaise: amount < 0n ? -amount : amount,
    occurredAt: new Date(date + "T00:00:00+05:30"),
    createdByAdminId: actor,
  };
  await client.foundationLotteryLedgerEntry.createMany({
    data: [
      {
        ...common,
        lineNumber: 1,
        accountCode: seller ? "PARTY_RECEIVABLE" : "PARTY_PAYABLE",
        side: debit ? "DEBIT" : "CREDIT",
      },
      {
        ...common,
        lineNumber: 2,
        accountCode: "OPENING_EQUITY",
        side: debit ? "CREDIT" : "DEBIT",
      },
    ],
  });
}
export async function savePartyOpening(
  client: Client,
  partyId: string,
  input: Record<string, unknown>,
  actor: string,
) {
  if (
    input.openingBalancePaise === undefined &&
    input.openingBalanceDate === undefined
  )
    return;
  const next = openingInput(input);
  const party = await client.foundationAccountingParty.findUnique({
    where: { id: partyId },
  });
  if (!party || party.organizationId !== input.organizationId)
    throw new Error("PARTY_NOT_FOUND");
  const previous = BigInt(party.openingBalancePaise ?? 0);
  if (
    previous === next.openingBalancePaise &&
    party.openingBalanceDate === next.openingBalanceDate
  )
    return;
  if (party.openingBalanceDate)
    await openingLedger(
      client,
      party,
      previous,
      party.openingBalanceDate,
      actor,
      true,
    );
  await openingLedger(
    client,
    party,
    next.openingBalancePaise,
    next.openingBalanceDate,
    actor,
  );
  await client.foundationAccountingParty.update({
    where: { id: partyId },
    data: next,
  });
  await client.foundationLotteryAuditEvent.create({
    data: {
      organizationId: party.organizationId,
      eventType: "PARTY_OPENING_UPDATED",
      entityType: "PARTY",
      entityId: partyId,
      actorAdminId: actor,
      metadata: {
        previousPaise: previous.toString(),
        previousDate: party.openingBalanceDate ?? null,
        amountPaise: next.openingBalancePaise.toString(),
        date: next.openingBalanceDate,
      },
    },
  });
}
