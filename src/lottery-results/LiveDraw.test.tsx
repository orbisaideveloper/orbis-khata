import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LiveDraw } from './LiveDraw'
afterEach(() => { cleanup(); vi.useRealTimers() })
it('updates the upcoming slot at the boundary and removes its timer on exit', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-22T12:19:59Z'))
  const view = render(<LiveDraw language="en"/>)
  expect(screen.getByText('2026-11-22 · 1PM IST')).toBeVisible()
  act(() => { vi.advanceTimersByTime(15000) })
  expect(screen.getByText('2026-11-22 · 6PM IST')).toBeVisible()
  expect(screen.getByRole('button')).toBeDisabled()
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
