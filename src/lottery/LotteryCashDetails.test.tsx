import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LotteryCashDetails } from "./LotteryCashDetails";
import { moneyFixture } from "../test/lottery-money-fixture";
afterEach(cleanup);
it("drills into exact cash rows and returns through methods to dashboard", () => {
  const close = vi.fn();
  render(
    <LotteryCashDetails
      workspace={moneyFixture}
      from="2026-10-30"
      to="2026-10-30"
      onClose={close}
    />,
  );
  expect(screen.queryByRole("button", { name: /UPI/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Cash/ }));
  const table = screen.getByRole("table");
  expect(within(table).getByText("Seller")).toBeInTheDocument();
  expect(within(table).getByText("Stockist")).toBeInTheDocument();
  expect(within(table).getByText("Wages")).toBeInTheDocument();
  expect(within(table).getByText("P1")).toBeInTheDocument();
  expect(within(table).getByText("₹30.00")).toHaveClass("money-out");
  expect(screen.getByText("Opening: ₹100.00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Back/ }));
  fireEvent.click(screen.getByRole("button", { name: /PWD/ }));
  expect(screen.getByRole("table")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Back/ }));
  fireEvent.click(screen.getByRole("button", { name: /Back/ }));
  expect(close).toHaveBeenCalledOnce();
});
it("shows legacy methods with activity and an empty-period statement", () => {
  const w = {
    ...moneyFixture,
    organization:{...moneyFixture.organization,paymentOptions:{upi:true,cheque:true,bankChannels:[]}},
    payments: [
      ...moneyFixture.payments,
      {
        ...moneyFixture.payments[1],
        id: "legacy",
        methodSplit: { upiPaise: "100", chequePaise: "200" },
      },
    ],
  };
  const { rerender } = render(
    <LotteryCashDetails
      workspace={w}
      from="2026-10-30"
      to="2026-10-30"
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: /UPI/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Bank/ }));
  expect(screen.getByRole("button", { name: /UPI/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Cheque/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /UPI/ }));
  fireEvent.click(screen.getByRole("button", { name: /Back/ }));
  rerender(
    <LotteryCashDetails
      workspace={{ ...moneyFixture, payments: [], expensePayments: [] }}
      from="2026-10-30"
      to="2026-10-30"
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByText("No transactions in this period."),
  ).toBeInTheDocument();
});
