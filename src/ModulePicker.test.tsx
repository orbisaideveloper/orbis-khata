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
  fireEvent.click(screen.getByRole("button", { name: /^লটারি$/ }));
  expect(select).toHaveBeenCalledWith("lottery");
  expect(screen.getByText("মডিউল").closest("details")).not.toHaveAttribute(
    "open",
  );
  rerender(<ModulePicker language="en" active="lottery" onSelect={select} />);
  fireEvent.click(screen.getByRole("button", { name: /Khata/ }));
  expect(select).toHaveBeenCalledWith("khata");
});
it('opens Customer view directly and exposes the reverse module route with current-page state',()=>{
 const select=vi.fn();const {rerender}=render(<ModulePicker language="en" active="khata" onSelect={select}/>);fireEvent.click(screen.getByText('Modules'));fireEvent.click(screen.getByRole('button',{name:/Customer view/}));expect(select).toHaveBeenLastCalledWith('customer');expect(screen.getByText('Modules').closest('details')).not.toHaveAttribute('open');
 rerender(<ModulePicker language="hi" active="customer" onSelect={select}/>);expect(screen.getByRole('button',{name:/ग्राहक दृश्य/})).toHaveAttribute('aria-current','page');fireEvent.click(screen.getByText('मॉड्यूल'));fireEvent.click(screen.getByRole('button',{name:/^लॉटरी$/}));expect(select).toHaveBeenLastCalledWith('lottery');
});

it('lists all six modules and opens Results while planned Daily accounts stays disabled', () => {
  const select = vi.fn()
  render(<ModulePicker language="en" active="results" onSelect={select}/>)
  fireEvent.click(screen.getByText('Modules'))
  expect(screen.getAllByRole('button')).toHaveLength(6)
  expect(screen.getByRole('button', { name: /Daily accounts/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Lottery results' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'Lottery results' }))
  expect(select).toHaveBeenCalledWith('results')
})
