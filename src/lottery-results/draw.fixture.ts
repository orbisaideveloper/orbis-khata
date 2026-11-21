export function drawFixture() {
  const specs = [['1st', 'full', 1, 10000000], ['cons', 'number', 1, 1000], ['2nd', 'number', 10, 10000], ['3rd', 'last4', 10, 500], ['4th', 'last4', 10, 250], ['5th', 'last4', 100, 120]] as const
  return { lottery: 'dear', date: '20-11-2026', slot: '8pm', status: 'published', ticket_format: 'DDL5', first: { series: '35B', number: '00220', amount: 10000000 }, files: { pdf: 'https://sambad.com/draw.pdf' }, prizes: specs.map(([tier, match, count, amount], index) => ({ tier, match, count, amount, numbers: fixtureNumbers(tier, count, index, match) })) }
}

function fixtureNumbers(tier: string, count: number, index: number, match: string): string[] {
  if (tier === '1st') return ['35B 00220']
  if (tier === 'cons') return ['00220']
  return Array.from({ length: count }, (_, n) => String(1000 * (index - 1) + n).padStart(match === 'number' ? 5 : 4, '0'))
}
