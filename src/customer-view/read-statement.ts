import { createLotteryAccountingService, serialize } from '../../vendor/foundation-lottery/runtime/lottery-accounting-service.js';
import { createLotteryStore, decodeLottery } from '../lottery/domain-store.ts';
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes';
import { partyStatement } from './statement.ts';
/** Private server projection; do not commit the disposable store or return its state. */
export async function readSharedStatement(state: unknown, organizationId: string, partyId: string, from: string, to: string, offset: number) {
    const store = createLotteryStore(decodeLottery(state));
    const service = createLotteryAccountingService({ prisma: store.client });
    const workspace = await service.getWorkspace({ organizationId }, { materializeRecurringExpenses: false });
    return partyStatement(serialize(workspace) as LotteryWorkspace, partyId, from, to, offset);
}
