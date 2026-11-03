type Lot = {quantity: bigint; value: bigint; known: boolean};
export type Withdrawal = {cost: bigint; missing: bigint; unpriced: bigint; known: boolean};
const rounded = (value: bigint, quantity: bigint) => (value + quantity / 2n) / quantity;

/** Report-local allocation only. Later receipts settle earlier shortages as of the cutoff. */
export class CostPool {
  private readonly lots: Lot[] = [];
  private readonly pending: Withdrawal[] = [];
  private readonly average: boolean;
  constructor(average = false) { this.average = average; }

  private take(lot: Lot, quantity: bigint) {
    const used = quantity < lot.quantity ? quantity : lot.quantity;
    const value = used === lot.quantity ? lot.value : rounded(lot.value * used, lot.quantity);
    lot.quantity -= used;
    lot.value -= value;
    return {used, value};
  }

  receive(quantity: bigint, value: bigint, known = true) {
    const incoming = {quantity, value, known};
    while (incoming.quantity > 0n && this.pending.length) {
      const request = this.pending[0];
      const part = this.take(incoming, request.missing);
      request.cost += part.value;
      request.missing -= part.used;
      if (!known) { request.unpriced += part.used; }
      request.known = request.missing === 0n && request.unpriced === 0n;
      if (request.missing === 0n) { this.pending.shift(); }
    }
    if (!incoming.quantity) { return; }
    const current = this.lots[0];
    if (this.average && current) {
      current.quantity += incoming.quantity;
      current.value += incoming.value;
      current.known &&= known;
    } else { this.lots.push(incoming); }
  }

  withdraw(quantity: bigint): Withdrawal {
    const result = {cost: 0n, missing: quantity, unpriced: 0n, known: false};
    while (result.missing > 0n && this.lots.length) {
      const lot = this.lots[0];
      const part = this.take(lot, result.missing);
      result.cost += part.value;
      result.missing -= part.used;
      if (!lot.known) { result.unpriced += part.used; }
      if (lot.quantity === 0n) { this.lots.shift(); }
    }
    result.known = result.missing === 0n && result.unpriced === 0n;
    if (result.missing > 0n) { this.pending.push(result); }
    return result;
  }

  balance() {
    const debt = this.pending.reduce((sum, request) => sum + request.missing, 0n);
    return {
      quantity: this.lots.reduce((sum, lot) => sum + lot.quantity, 0n) - debt,
      value: this.lots.reduce((sum, lot) => sum + lot.value, 0n),
      known: debt === 0n && this.lots.every(lot => lot.known),
    };
  }
}
