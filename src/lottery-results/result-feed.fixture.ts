import result from './sample-2026-11-20.json'

// Shared deterministic feed for result-view tests; never imported by the app.
export function useResultFeed() {
  return { results: [result], status: 'ready' as const }
}
