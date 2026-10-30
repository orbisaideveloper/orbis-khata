import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  LotteryParty,
  LotteryWorkspace,
} from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { SellerReceipt } from "./SellerReceipt";
const party = {
  id: "seller",
  name: "Seller",
  openingBalancePaise: "50000",
  openingBalanceDate: "2026-10-29",
} as LotteryParty;
const workspace = {
  organization: { id: "org" },
  sales: [],
  draftSales: [],
  payments: [],
} as unknown as LotteryWorkspace;
afterEach(cleanup);
it("saves one exact split receipt and resets after confirmation while retaining carry forward", async () => {
  let release!: () => void;
  const onSave = vi.fn((_payload: Record<string, unknown>) => {
    fireEvent.click(screen.getByRole("button", { name: "Save receipt" }));
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  render(
    <SellerReceipt
      workspace={workspace}
      party={party}
      day="2026-10-30"
      bill={100000n}
      disabled={false}
      onSave={onSave}
    />,
  );
  expect(screen.getAllByText("₹1,500.00")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Receipt Cash"), {
    target: { value: "700" },
  });
  fireEvent.change(screen.getByLabelText("Receipt PWD"), {
    target: { value: "200" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save receipt" }));
  expect(onSave).toHaveBeenCalledOnce();
  expect(onSave.mock.calls[0][0]).toMatchObject({
    partyId: "seller",
    direction: "RECEIPT",
    totalAmountPaise: "90000",
    methodSplit: { cashPaise: "70000", pwtPaise: "20000", bankPaise: "0" },
  });
  expect(screen.getByText("₹600.00")).toBeInTheDocument();
  expect(screen.getByLabelText("Receipt Cash")).toBeDisabled();
  release();
  await waitFor(() =>
    expect(screen.getByLabelText("Receipt Cash")).toHaveValue(""),
  );
});
it("does not submit invalid values and preserves entered amounts after an uncertain save", async () => {
  const onSave = vi.fn().mockRejectedValue(new Error("offline"));
  render(
    <SellerReceipt
      workspace={workspace}
      party={party}
      day="2026-10-30"
      bill={100000n}
      disabled={false}
      onSave={onSave}
    />,
  );
  expect(screen.getByRole("button", { name: "Save receipt" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Receipt Bank"), {
    target: { value: "1.234" },
  });
  expect(screen.getByRole("button", { name: "Save receipt" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Receipt Bank"), {
    target: { value: "500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save receipt" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Retry");
  expect(screen.getByLabelText("Receipt Bank")).toHaveValue("500");
});

it("shows the last receipt on its Indian business date and includes today collection once", () => {
  const paid = {
    ...workspace,
    payments: [
      {
        id: "payment",
        partyName:"Seller",periodId:null,periodLabel:null,reference:"receipt",settledPaise:"0",availablePaise:"90000",
        partyId: "seller",
        direction: "RECEIPT",
        occurredAt: "2026-10-29T20:00:00Z",
        totalAmountPaise: "90000",
        methodSplit: { cashPaise: "90000" },
      },
    ],
  } as LotteryWorkspace;
  render(
    <SellerReceipt
      workspace={paid}
      party={party}
      day="2026-10-30"
      bill={100000n}
      disabled={false}
      onSave={vi.fn()}
    />,
  );
  expect(screen.getByText("Last receipt · 2026-10-30")).toBeInTheDocument();
  expect(screen.getByText("₹600.00")).toBeInTheDocument();
});
