import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DateRange } from './DateRange';
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('selects presets together and preserves manually chosen custom dates', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T18:00:00Z'));
    function Harness() {
        const [range, setRange] = useState({ from: '2026-10-01', to: '2026-10-28' });
        return <DateRange language="en" {...range} onChange={(from, to) => setRange({ from, to })}/>;
    }
    render(<Harness/>);
    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-27');
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-27');
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-22');
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-28');
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01');
    expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true');
});
