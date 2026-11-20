import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceCards } from './WorkspaceCards'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const owner = 'workspace-owner'
const order = () => Array.from(document.querySelectorAll<HTMLElement>('[data-workspace-card]'), card => card.dataset.workspaceCard)

it('uses the existing default order, appends new cards and restores an owner-specific reordering', () => {
  const open = vi.fn()
  const first = render(<WorkspaceCards owner={owner} language="en" onOpen={open}/>)
  expect(order()).toEqual(['khata', 'farm', 'customer', 'lottery', 'daily', 'results'])
  expect(screen.getByText('Daily accounts')).toBeVisible()
  expect(screen.getByText('Lottery results')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /^Lottery results\s*Check/ }))
  expect(open).toHaveBeenCalledWith('results')
  fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder card', description: 'Customer view' }), { key: 'ArrowUp' })
  expect(order()).toEqual(['khata', 'customer', 'farm', 'lottery', 'daily', 'results'])
  fireEvent.click(screen.getByRole('button', { name: /^Customer view\s*Linked/ }))
  expect(open).toHaveBeenCalledWith('customer')
  first.unmount()
  const second = render(<WorkspaceCards owner={owner} language="en" onOpen={open}/>)
  expect(order()[1]).toBe('customer')
  second.unmount()
  render(<WorkspaceCards owner="another-owner" language="en" onOpen={open}/>)
  expect(order()[1]).toBe('farm')
})

it('moves a held card and suppresses the release click', () => {
  vi.useFakeTimers()
  const open = vi.fn()
  const { container } = render(<WorkspaceCards owner={owner} language="en" onOpen={open}/>)
  const source = screen.getByRole('button', { name: /^Customer view\s*Linked/ })
  const target = container.querySelector('[data-workspace-card="khata"]')!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
  try {
    fireEvent.touchStart(source, { touches: [{ clientX: 100, clientY: 160 }] })
    act(() => vi.advanceTimersByTime(450))
    fireEvent.touchMove(source, { touches: [{ clientX: 100, clientY: 90 }] })
    fireEvent.touchEnd(source)
    fireEvent.click(source, { detail: 1 })
    expect(order().slice(0, 3)).toEqual(['customer', 'khata', 'farm'])
    expect(open).not.toHaveBeenCalled()
  } finally {
    Reflect.deleteProperty(document, 'elementFromPoint')
  }
})
