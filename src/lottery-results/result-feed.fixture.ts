import result from './sample-2026-11-20.json'
import documents from '../../public/lottery-results/documents.json'

// Shared deterministic feed for result-view tests; never imported by the app.
export function useResultFeed() {
  return { results: [result], documents: documents.documents, status: 'ready' as const }
}
