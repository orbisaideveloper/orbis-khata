import { matchDraw } from './draw-json.ts'
import type { createDrawService } from './draw-service.ts'
import type { TicketInput } from './ticket.ts'

export function createTicketLookup(load: ReturnType<typeof createDrawService>) {
  return async (ticket: TicketInput) => {
    try { return matchDraw((await load(ticket.date, ticket.slot)).draw, ticket) }
    catch (error) {
      if (error instanceof Error && error.message === 'DRAW_PENDING') return { ...ticket, status: 'pending' as const, prize: null }
      throw error
    }
  }
}
