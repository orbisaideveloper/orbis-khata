import result from './sample-2026-11-20.json'

// Shared deterministic feed for result-view tests; never imported by the app.
export function useResultFeed() {
  return { results: [result], documents: [{ date: result.date, slot: result.slot, officialUrl: result.officialUrl }, { date: result.date, slot: '8pm', officialUrl: 'https://nagalandlotteries.com/old_results/EN201126.PDF' }], status: 'ready' as const }
}
