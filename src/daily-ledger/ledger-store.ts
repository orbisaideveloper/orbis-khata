import type { Command, Entry } from './journal'

export interface LedgerStore {
  list(): Promise<readonly Entry[]>
  save(command: Command): Promise<Entry>
}
