import { androidLocalFirst } from '../native-local/route';
import { useRef, useState, useCallback } from 'react';
import { requestKhata } from '../accounting/api';
import { displayIdentity, type Share } from './contract';
/** UI state only. Every invitation/revocation is authorized again by the gateway. */
export function useMasterPartyLink(organization: string) {
    const [links, setLinks] = useState<Share[]>([]), [party, setParty] = useState(''), [draft, setDraft] = useState(''), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false), [confirm, setConfirm] = useState<Share | null>(null);
    const generation = useRef(0), operation = useRef<{
        signature: string;
        id: string;
    } | null>(null), pending = useRef(false);
    const active = links.filter(link => link.outgoing && link.organizationId === organization && link.partyId === party && (link.status === 'pending' || link.status === 'accepted'));
    const load = useCallback(async (version: number) => {
        const rows = await requestKhata<Share[]>('party-sharing', { action: 'list' });
        if (rows.some(row => row.outgoing && (!row.organizationId || !row.partyId))) {
            throw new Error('LINK_BACKEND_UPDATE_REQUIRED');
        }
        if (version === generation.current) {
            setLinks(rows);
            setReady(true);
        }
    }, []);
    const select = useCallback(async (id: string) => {
        if (androidLocalFirst() || !organization) {
            return;
        }
        const version = ++generation.current;
        setParty(id);
        setDraft('');
        setLinks([]);
        setReady(false);
        setError(false);
        setConfirm(null);
        operation.current = null;
        try {
            await load(version);
        }
        catch {
            if (version === generation.current) {
                setError(true);
            }
        }
    }, [load, organization]);
    async function save(id: string) {
        if (!draft.trim() || active.length) {
            return true;
        }
        if (pending.current) {
            return false;
        }
        if (!ready || !displayIdentity.test(draft)) {
            setError(true);
            return false;
        }
        pending.current = true;
        setBusy(true);
        setError(false);
        setParty(id);
        const version = generation.current;
        const signature = JSON.stringify([organization, id, draft]);
        if (operation.current?.signature !== signature) {
            operation.current = { signature, id: crypto.randomUUID() };
        }
        try {
            await requestKhata('party-sharing', { action: 'invite', id: operation.current.id, organization, party: id, recipient: draft });
            await load(version);
            if (version === generation.current) {
                setDraft('');
                operation.current = null;
            }
            return true;
        }
        catch {
            if (version === generation.current) {
                setError(true);
            }
            return false;
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    }
    async function revoke() {
        if (!confirm || pending.current) {
            return;
        }
        const version = generation.current;
        pending.current = true;
        setBusy(true);
        setError(false);
        try {
            await requestKhata('party-sharing', { action: 'revoke', id: confirm.id });
            await load(version);
            if (version === generation.current) {
                setConfirm(null);
            }
        }
        catch {
            if (version === generation.current) {
                setError(true);
            }
        }
        finally {
            pending.current = false;
            setBusy(false);
        }
    }
    return { active, draft, setDraft, ready, busy, error, confirm, setConfirm, select, save, revoke, valid: !draft.trim() || (ready && displayIdentity.test(draft)) };
}
export type MasterLink = ReturnType<typeof useMasterPartyLink>;
