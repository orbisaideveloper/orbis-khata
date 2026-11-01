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
  expense = false,
) {
  if (amount === 0n) return;
  const seller = party.partyType === "SELLER" || party.partyType === "CUSTOMER";
  const debit = (seller === amount > 0n) !== reverse;
  const transactionId = crypto.randomUUID();
  let accountCode = seller ? "PARTY_RECEIVABLE" : "PARTY_PAYABLE";
  if (expense) accountCode = "EXPENSE_PAYABLE";
  const common = {
    organizationId: party.organizationId,
    transactionId,
    sourceType: expense ? "EXPENSE_OPENING" : "PARTY_OPENING",
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
        accountCode,
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
async function saveOpening(
  client: Client,
  partyId: string,
  input: Record<string, unknown>,
  actor: string,
  expense: boolean,
) {
  if (
    input.openingBalancePaise === undefined &&
    input.openingBalanceDate === undefined
  )
    return;
  const next = openingInput(input);
  const model = expense ? client.foundationAccountingExpenseProfile : client.foundationAccountingParty;
  const party = await model.findUnique({
    where: { id: partyId },
  });
  if (!party || party.organizationId !== input.organizationId)
    throw new Error(expense ? "EXPENSE_PROFILE_NOT_FOUND" : "PARTY_NOT_FOUND");
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
      expense,
    );
  await openingLedger(
    client,
    party,
    next.openingBalancePaise,
    next.openingBalanceDate,
    actor,
    false,
    expense,
  );
  await model.update({
    where: { id: partyId },
    data: next,
  });
  await client.foundationLotteryAuditEvent.create({
    data: {
      organizationId: party.organizationId,
      eventType: expense ? "EXPENSE_OPENING_UPDATED" : "PARTY_OPENING_UPDATED",
      entityType: expense ? "EXPENSE_PROFILE" : "PARTY",
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

export function savePartyOpening(client: Client, id: string, input: Record<string, unknown>, actor: string) {
  return saveOpening(client, id, input, actor, false);
}
export function saveExpenseOpening(client: Client, id: string, input: Record<string, unknown>, actor: string) {
  return saveOpening(client, id, input, actor, true);
}
