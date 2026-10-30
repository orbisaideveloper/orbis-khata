import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModulePicker } from "./ModulePicker";
afterEach(cleanup);
it("switches directly between available modules and keeps Farming visibly unavailable", () => {
  const select = vi.fn();
  const { rerender } = render(
    <ModulePicker language="bn" active="khata" onSelect={select} />,
  );
  expect(screen.getByRole("button", { name: /ফার্মিং/ })).toBeDisabled();
  fireEvent.click(screen.getByText("মডিউল"));
  fireEvent.click(screen.getByRole("button", { name: /লটারি/ }));
  expect(select).toHaveBeenCalledWith("lottery");
  expect(screen.getByText("মডিউল").closest("details")).not.toHaveAttribute(
    "open",
  );
  rerender(<ModulePicker language="en" active="lottery" onSelect={select} />);
  fireEvent.click(screen.getByRole("button", { name: /Khata/ }));
  expect(select).toHaveBeenCalledWith("khata");
});
