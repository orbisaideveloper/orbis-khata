import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  LotteryContact,
  PartyOpeningFields,
  openingPayload,
  partyOpeningForm,
} from "./PartyOpeningFields";
import { LotteryLanguage } from "./language";
import type { LotteryParty } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("edits both balance directions and dates using exact paise", () => {
  const onChange = vi.fn();
  const value = partyOpeningForm(
    {
      openingBalancePaise: "-650050",
      openingBalanceDate: "2026-10-29",
    } as LotteryParty,
    "2026-10-30",
  );
  expect(openingPayload(value)).toEqual({
    openingBalancePaise: "-650050",
    openingBalanceDate: "2026-10-29",
  });
  expect(openingPayload({ ...value, amount: "1.234" })).toBeNull();
  expect(openingPayload({ ...value, advance: false })).toHaveProperty(
    "openingBalancePaise",
    "650050",
  );
  expect(partyOpeningForm(undefined, "2026-10-30")).toEqual({
    amount: "0.00",
    advance: false,
    date: "2026-10-30",
  });
  const { rerender } = render(
    <PartyOpeningFields value={value} onChange={onChange} stockist />,
  );
  fireEvent.change(screen.getByLabelText("Opening balance direction"), {
    target: { value: "due" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, advance: false });
  fireEvent.change(screen.getByLabelText("Opening balance amount"), {
    target: { value: "25" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, amount: "25" });
  fireEvent.change(screen.getByLabelText("Opening balance date"), {
    target: { value: "2026-10-28" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, date: "2026-10-28" });
  rerender(
    <PartyOpeningFields value={value} onChange={onChange} stockist={false} />,
  );
  expect(screen.getByText("Advance received")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Opening balance direction"), {
    target: { value: "advance" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, advance: true });
});
it("uses contact permission only on tap and supports cancellation/manual fallback", async () => {
  const select = vi.fn().mockResolvedValue([{ tel: ["+91 9000012345"] }]),
    onNumber = vi.fn();
  vi.stubGlobal("navigator", { contacts: { select } });
  render(<LotteryContact onNumber={onNumber} />);
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(onNumber).toHaveBeenCalledWith("+91 9000012345"));
  select.mockResolvedValueOnce([]);
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(select).toHaveBeenCalledTimes(2));
  select.mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(select).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole("alert")).toBeNull();
  select.mockRejectedValueOnce(new Error("Denied"));
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Type it instead");
  cleanup();
  vi.stubGlobal("navigator", {});
  render(
    <LotteryLanguage.Provider value="bn">
      <LotteryContact onNumber={onNumber} />
    </LotteryLanguage.Provider>,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
