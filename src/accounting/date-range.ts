export type DatePreset = 'today' | 'yesterday' | 'seven' | 'month';
export function presetRange(preset: DatePreset, day: string) {
    const date = new Date(day + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(day) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
        throw new Error('INVALID_DATE');
    }
    const shift = (days: number) => {
        const shifted = new Date(date);
        shifted.setUTCDate(shifted.getUTCDate() + days);
        return shifted.toISOString().slice(0, 10);
    };
    if (preset === 'yesterday') return { from: shift(-1), to: shift(-1) };
    if (preset === 'seven') return { from: shift(-6), to: day };
    if (preset === 'month') return { from: day.slice(0, 7) + '-01', to: day };
    return { from: day, to: day };
}
