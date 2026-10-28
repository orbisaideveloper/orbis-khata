import { useEffect, useState } from 'react';
import { useBookServices } from '../books-services';
import { demoRequest } from '../demo/store';
import { requestKhata } from './api';
import { defaultSettings, validSettings } from './workspace-contract';
export function useWorkspaceSettings(company: string, disabled = false) {
    const services = useBookServices(), request = services?.request ?? (import.meta.env.DEV ? demoRequest : requestKhata);
    const [result, setResult] = useState({ company: '', settings: defaultSettings(), failed: false });
    useEffect(() => { if (disabled || !company) return; let alive = true; void request('workspace', { company, action: 'settings' }).then(value => { if (alive) setResult({ company, settings: validSettings(value) ? value : defaultSettings(), failed: false }); }, () => { if (alive) setResult({ company, settings: defaultSettings(), failed: true }); }); return () => { alive = false; }; }, [company, request, disabled]);
    return { request, settings: result.company === company ? result.settings : defaultSettings(), failed: result.company === company && result.failed };
}
