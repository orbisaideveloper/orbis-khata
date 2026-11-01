const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const displayIdentity = /^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/u;
export type ShareCommand = {
    action: 'list' | 'choices';
} | {
    action: 'invite';
    id: string;
    organization: string;
    party: string;
    recipient: string;
} | {
    action: 'accept' | 'decline' | 'revoke';
    id: string;
} | {
    action: 'statement';
    id: string;
    from: string;
    to: string;
    offset: number;
};
export type Share = {
    organizationId?: string;
    partyId?: string;
    id: string;
    organization: string;
    party: string;
    partyType: string;
    recipient: string;
    status: 'pending' | 'accepted' | 'declined' | 'revoked';
    outgoing: boolean;
};
function date(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
        return false;
    }
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const id = (value: unknown) => typeof value === 'string' && uuid.test(value);
const fields: Record<string, string[]> = { list: ['action'], choices: ['action'], invite: ['action', 'id', 'organization', 'party', 'recipient'], statement: ['action', 'id', 'from', 'to', 'offset'], accept: ['action', 'id'], decline: ['action', 'id'], revoke: ['action', 'id'] };
function invitation(value: Record<string, unknown>) { return id(value.organization) && id(value.party) && typeof value.recipient === 'string' && displayIdentity.test(value.recipient); }
function period(value: Record<string, unknown>) { return date(value.from) && date(value.to) && value.from <= value.to && Number.isSafeInteger(value.offset) && Number(value.offset) >= 0 && Number(value.offset) <= 1000000; }
/** Reject ownership claims and unknown fields before any database work. */
export function shareCommand(value: Record<string, unknown>): value is ShareCommand {
    if (typeof value.action !== 'string' || !Object.hasOwn(fields, value.action)) {
        return false;
    }
    const action = value.action, allowed = fields[action];
    if (!allowed || Object.keys(value).some(key => !allowed.includes(key))) {
        return false;
    }
    if (action === 'list' || action === 'choices') {
        return true;
    }
    if (!id(value.id)) {
        return false;
    }
    if (action === 'invite') {
        return invitation(value);
    }
    return action !== 'statement' || period(value);
}
