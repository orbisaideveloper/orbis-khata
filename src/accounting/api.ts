import { authClient } from '../auth/client';
import type { Command, Company, Report } from './model';
export function createKhataDataClient(options: {
    url: string;
    token: () => Promise<string | null>;
    fetchImpl?: typeof fetch;
}) {
    const endpoint = new URL(options.url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new Error('KHATA_DATA_ENDPOINT_INVALID');
    }
    const pending=new Map<string,Promise<unknown>>();
    const cached=new Map<string,{value:unknown;until:number}>();let generation=0;let previousToken:string|null=null;
    const invalidate=()=>{generation++;pending.clear();cached.clear();};
    async function send<T>(operation:string,input:unknown,token:string):Promise<T>{
        const response = await (options.fetchImpl ?? fetch)(endpoint.href, {
            method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
            body: JSON.stringify({ version: 'orbis.khata.data.v1', operation, input }),
        });
        const text = await response.text();
        if (text.length > 2000000) {
            throw new Error('KHATA_DATA_RESPONSE_INVALID');
        }
        const value = JSON.parse(text) as {
            data: T;
            code?: string;
            reason?: string;
        };
        if (!response.ok) {
            const error = new Error('KHATA_DATA_REQUEST_FAILED') as Error & {
                code?: string;
                reason?: string;
            };
            error.code = typeof value.code === 'string' ? value.code : undefined;
            error.reason = typeof value.reason === 'string' ? value.reason : undefined;
            throw error;
        }
        return value.data;
    }
    async function request<T>(operation:string,input:unknown):Promise<T>{
        const token=await options.token();if(!token){invalidate();previousToken=null;throw new Error('AUTH_REQUIRED');}if(token!==previousToken){invalidate();previousToken=token;}
        const action=(input as {action?:string}|null)?.action;
        const reading=['companies','masters','report','inventory-report','expense-report','party-balance'].includes(operation)||(operation==='workspace'&&['settings','accounts','detail','retired-companies','number-preview'].includes(action??''));
        if(!reading){invalidate();try{return await send<T>(operation,input,token);}finally{invalidate();}}
        const key=JSON.stringify([token,operation,input]);const snapshot=cached.get(key);if(snapshot&&snapshot.until>Date.now()){return structuredClone(snapshot.value) as T;}const revision=generation;const existing=pending.get(key);if(existing){return existing as Promise<T>;}
        const result=send<T>(operation,input,token);pending.set(key,result);
        try{const value=await result;if(revision===generation&&(operation==='masters'||(operation==='workspace'&&action==='settings'))){if(cached.size>=50){cached.clear();}cached.set(key,{value:structuredClone(value),until:Date.now()+8000});}return value;}finally{if(pending.get(key)===result){pending.delete(key);}}
    }
    return Object.assign(request,{invalidate});
}
let liveClient:ReturnType<typeof createKhataDataClient>|undefined;
let liveUrl='';
function invalidateKhataReads(){liveClient?.invalidate();}
if(typeof window!=='undefined'){window.addEventListener('khata-refresh',invalidateKhataReads);}
export async function requestKhata<T>(operation: string, input: unknown): Promise<T> {
    if (import.meta.env.DEV && import.meta.env.VITE_KHATA_DEMO === 'true') {
        return (await import('../demo/store')).demoRequest<T>(operation, input);
    }
    const url = import.meta.env.VITE_KHATA_DATA_URL as string | undefined;
    const client = authClient;
    if (!url || !client) {
        throw new Error('KHATA_DATA_NOT_CONFIGURED');
    }
    if(!liveClient||liveUrl!==url){liveUrl=url;liveClient=createKhataDataClient({url,token:()=>client.central.accessToken()});}
    return liveClient<T>(operation,input);
}
export async function companies(_owner: string): Promise<Company[]> { return requestKhata<Company[]>('companies', {}); }
export async function createRecord(table: 'khata_companies' | 'khata_parties', row: Record<string, string>): Promise<Company> {
    // The backend derives ownership from the verified central session.
    const { owner_id: _owner, ...safe } = row;
    return requestKhata<Company>('create', { table, row: safe });
}
export async function report(company: string, from: string, to: string, party: string, offset: number): Promise<Report> {
    return requestKhata<Report>('report', { company, from, to, party: party || null, offset });
}
export async function post(command: Command): Promise<void> { await requestKhata<unknown>('post', command); }
export function rejected(error: unknown): boolean {
    const code = (error as {
        code?: string;
        reason?: string;
    })?.code ?? '';
    return /^(22|23|28|42|P0)/.test(code);
}
export async function expenseReport(company: string, from: string, to: string, offset: number): Promise<import('./expense-model').ExpenseReport> { return requestKhata('expense-report', { company, from, to, offset }); }
export async function postExpense(command: import('./expense-model').ExpenseCommand): Promise<void> { await requestKhata('expense-post', command); }
