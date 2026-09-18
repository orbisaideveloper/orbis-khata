import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Vite starter smoke', () => {
  it('renders the actual starter and updates the counter', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Get started' }),
    ).toBeInTheDocument()

    const counter = screen.getByRole('button', {
      name: 'Count is 0',
    })

    fireEvent.click(counter)

    expect(
      screen.getByRole('button', { name: 'Count is 1' }),
    ).toBeInTheDocument()
  })
})
