import { expect, it } from 'vitest';
import { presetRange } from './date-range';
it('uses inclusive seven days and crosses month, leap-day and year boundaries', () => {
    expect(presetRange('seven', '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' });
    expect(presetRange('yesterday', '2024-03-01')).toEqual({ from: '2024-02-29', to: '2024-02-29' });
    expect(presetRange('month', '2026-10-28')).toEqual({ from: '2026-10-01', to: '2026-10-28' });
    expect(presetRange('today', '2026-10-28')).toEqual({ from: '2026-10-28', to: '2026-10-28' });
    expect(() => presetRange('today', '2026-02-30')).toThrow('INVALID_DATE');
});
