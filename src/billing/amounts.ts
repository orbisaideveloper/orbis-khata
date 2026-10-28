function trimTrailingZeros(value: string) {
    let end = value.length;
    while (end > 0 && value[end - 1] === '0')
        end--;
    return value.slice(0, end);
}
const quantityScale = 1000000n, rateScale = 100000000n;
const divisor = quantityScale * rateScale / 100n;
function scaled(input: string, places: number, whole: number) {
    const expression = new RegExp(String.raw `^\d{1,${whole}}(?:\.\d{1,${places}})?$`, 'u');
    if (!expression.test(input)) {
        throw new Error('INVALID_DECIMAL');
    }
    const [integer, fraction = ''] = input.split('.');
    return BigInt(integer) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
}
function positive(input: string, places: number, whole: number) {
    const value = scaled(input, places, whole);
    if (value <= 0n) {
        throw new Error('POSITIVE_REQUIRED');
    }
    return value;
}
function rounded(numerator: bigint, denominator: bigint) { return (numerator + denominator / 2n) / denominator; }
function decimal(value: bigint, places: number, minPlaces = 2) {
    const scale = 10n ** BigInt(places), fraction = trimTrailingZeros(String(value % scale).padStart(places, '0')).padEnd(minPlaces, '0');
    return `${value / scale}${fraction ? '.' + fraction : ''}`;
}
export function amountFromRate(qty: string, rate: string) {
    const value = rounded(positive(qty, 6, 6) * positive(rate, 8, 10), divisor);
    if (value <= 0n || value > 999999999999n) {
        throw new Error('AMOUNT_OUT_OF_RANGE');
    }
    return String(value);
}
export function rateFromAmount(qty: string, amount: string) {
    const q = positive(qty, 6, 6), money = positive(amount, 2, 10);
    const value = rounded(money * divisor, q);
    if (value <= 0n || value >= 10000000000n * rateScale) {
        throw new Error('RATE_OUT_OF_RANGE');
    }
    const result = decimal(value, 8);
    if (amountFromRate(qty, result) !== String(money)) {
        throw new Error('RATE_PRECISION');
    }
    return result;
}
function amountInput(minor: string) { return decimal(BigInt(minor), 2); }
export function rateMinor(rate: string) { return String(rounded(positive(rate, 8, 10) * 100n, rateScale)); }
export function rateDisplay(rate: string) { return `₹${decimal(BigInt(rateMinor(rate)), 2)}`; }
export type PricingLine = {
    quantity: string;
    rate: string;
    amount: string;
    basis: 'rate' | 'amount';
};
export function updatePricing<T extends PricingLine>(line: T, field: 'quantity' | 'rate' | 'amount', value: string): T {
    const result = { ...line, [field]: value, basis: field === 'quantity' ? line.basis : field };
    try {
        if (result.basis === 'amount') {
            result.rate = rateFromAmount(result.quantity, result.amount);
        }
        else {
            result.amount = amountInput(amountFromRate(result.quantity, result.rate));
        }
    }
    catch {
        if (result.basis === 'amount') {
            result.rate = '';
        }
        else {
            result.amount = '';
        }
    }
    return result as T;
}
