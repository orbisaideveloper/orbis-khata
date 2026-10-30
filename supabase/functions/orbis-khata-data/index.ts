import {runLottery,type LotteryInput} from '../../../src/lottery/service.ts';
import postgres from 'npm:postgres@3.4.7';
import { createCentralVerifier, createKhataGateway } from '../../../src/accounting/server-gateway.ts';
const env = (key: string) => Deno.env.get(key) ?? '';
const endpoint = new URL(env('KHATA_DATABASE_URL') || env('SUPABASE_DB_URL'));
const ref = 'gqyaxsczlmvppxuoqbox';
if (!((endpoint.hostname === `db.${ref}.supabase.co`) ||
    (endpoint.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(endpoint.username) === `postgres.${ref}`))) {
    throw new Error('KHATA_DATABASE_TARGET_INVALID');
}
const sql = postgres(endpoint.href, { max: 3, prepare: false, ssl: { rejectUnauthorized: true }, connect_timeout: 8, idle_timeout: 10 });
// Startup readiness checks connectivity only; never reads customer records.
void sql `select 1 as ready`.then(() => console.info('KHATA_DATABASE_CONNECTION_READY'), () => console.warn('KHATA_DATABASE_CONNECTION_UNAVAILABLE'));
const verificationKey = env('ORBIS_CUSTOMER_VERIFY_KEY');
if (verificationKey && verificationKey.length < 32) {
    throw new Error('KHATA_VERIFICATION_KEY_INVALID');
}
// Both supported Admin endpoints verify the customer's live session and canonical ID.
// Trial setup uses the existing public session endpoint; a configured service key
// selects the service endpoint for its separate server-to-server rate limit.
const verify = createCentralVerifier({
    baseUrl: env('ORBIS_CUSTOMER_API_URL') || 'https://orbis-admin-staging.onrender.com',
    ...(verificationKey ? { verificationKey } : {}),
});
const handler = createKhataGateway({ origins: (env('KHATA_ORIGINS') || 'https://orbis-khata.onrender.com,http://127.0.0.1:5173').split(',').map(value => value.trim()).filter(Boolean), verify,
    execute: async (principal, operation) => sql.begin(async (tx) => {
        // Central identity stays canonical; product-local ownership preserves historical rows.
        const owners = await tx `select orbis_khata.resolve_ledger_owner(${principal.orbisIdentityId}::uuid) as id`;
        const ledgerOwnerId = owners[0]?.id;
        if (typeof ledgerOwnerId !== 'string') {
            throw new Error('KHATA_OWNER_RESOLUTION_FAILED');
        }
        await tx `select set_config('orbis.khata.gateway_verified','v1',true)`;
        await tx `set local role authenticated`;
        await tx `select set_config('request.jwt.claims',${JSON.stringify({ sub: ledgerOwnerId, role: 'authenticated' })},true)`;
        const input = operation.input;
        if(operation.operation==='lottery'){
            const request=input as LotteryInput;
            const load={action:'load',request,...(request.operationId?{operationId:request.operationId}:{})};
            const rows=await tx `select public.khata_lottery_store_v1(${tx.json(load)}::jsonb) as data`;
            const saved=rows[0].data;
            if(saved.replay)return saved.result;
            let calculated;
            try{calculated=await runLottery(saved.state,request,principal.orbisIdentityId);}catch(error){
                const code=error&&typeof error==='object'&&'code' in error?String(error.code):'LOTTERY_COMMAND_REJECTED';
                const currentVersion=error&&typeof error==='object'&&'currentVersion' in error?error.currentVersion:undefined;
                return {lotteryError:/^[A-Z_]{2,80}$/u.test(code)?code:'LOTTERY_COMMAND_REJECTED',...(Number.isSafeInteger(currentVersion)&&Number(currentVersion)>=0?{currentVersion}:{})};
            }
            const commit={action:'commit',version:saved.version,state:calculated.state,result:calculated.result,request,...(request.operationId?{operationId:request.operationId}:{})};
            const result=await tx `select public.khata_lottery_store_v1(${tx.json(commit)}::jsonb) as data`;
            return result[0].data;
        }
        if (operation.operation === 'workspace') {
            const result = await tx `select public.khata_workspace_v3(${tx.json(input)}::jsonb) as data`;
            return result[0].data;
        }
        if (operation.operation === 'retired-companies') {
            return await tx `select id,name,deleted_at,purge_after from public.khata_companies where owner_id=${ledgerOwnerId}::uuid and deleted_at is not null order by deleted_at desc`;
        }
        if (operation.operation === 'companies') {
            const rows = await tx `select id,name from public.khata_companies where owner_id=${ledgerOwnerId}::uuid and deleted_at is null order by created_at,id limit 10001`;
            if (rows.length > 10000) {
                throw new Error('KHATA_COMPANY_LIMIT');
            }
            return rows;
        }
        if (operation.operation === 'create') {
            const row = input.row as Record<string, string>;
            const companies = input.table === 'khata_companies';
            const created = companies
                ? await tx `insert into public.khata_companies(id,name,owner_id) values(${row.id}::uuid,${row.name},${ledgerOwnerId}::uuid) on conflict(id) do nothing returning id,name`
                : await tx `insert into public.khata_parties(id,name,company_id,kind) values(${row.id}::uuid,${row.name},${row.company_id}::uuid,${row.kind}) on conflict(id) do nothing returning id,name`;
            if (created.length) {
                if (companies) {
                    await tx `select public.khata_prepare_company_v2(${row.id}::uuid)`;
                }
                return created[0];
            }
            const existing = companies
                ? await tx `select id,name,owner_id from public.khata_companies where id=${row.id}::uuid`
                : await tx `select id,name,company_id,kind from public.khata_parties where id=${row.id}::uuid`;
            const expected = companies ? { ...row, owner_id: ledgerOwnerId } : row;
            if (!existing.length || Object.entries(expected).some(([key, value]) => existing[0][key] !== value)) {
                throw new Error('KHATA_IDEMPOTENCY_CONFLICT');
            }
            return { id: existing[0].id, name: existing[0].name };
        }
        if (typeof input.company === 'string') {
            const active = await tx `select id from public.khata_companies where id=${input.company}::uuid and owner_id=${ledgerOwnerId}::uuid and deleted_at is null`;
            if (!active.length) {
                throw Object.assign(new Error('COMPANY_NOT_ACCESSIBLE'), { code: 'P0001' });
            }
        }
        if (operation.operation === 'masters') {
            const result = await tx `select public.khata_masters_v2(${String(input.company)}::uuid) as data`;
            return result[0].data;
        }
        if (operation.operation === 'party-save' || operation.operation === 'item-save') {
            const result = await tx `select public.khata_master_save_v2(${operation.operation === 'party-save' ? 'party' : 'item'},${tx.json(input)}::jsonb) as data`;
            return result[0].data;
        }
        if (operation.operation === 'party-delete' || operation.operation === 'item-delete') {
            await tx `select public.khata_master_delete_v2(${operation.operation === 'party-delete' ? 'party' : 'item'},${String(input.company)}::uuid,${String(input.id)}::uuid)`;
            return null;
        }
        if (operation.operation === 'party-balance') {
            const result = await tx `select public.khata_party_balance_v2(${String(input.company)}::uuid,${String(input.party)}::uuid,${String(input.date)}::date,${String(input.kind)}) as data`;
            return result[0].data;
        }
        if (operation.operation === 'expense-bill') {
            const result = await tx `select public.khata_expense_bill_v2(${tx.json(input.command)}::jsonb,${tx.json(input.lines)}::jsonb) as data`;
            return result[0].data;
        }
        if (operation.operation === 'inventory-post') {
            const result = await tx `select public.khata_inventory_post_v1(${tx.json(input)}::jsonb) as data`;
            return result[0].data;
        }
        if (operation.operation === 'inventory-report') {
            const result = await tx `select public.khata_inventory_report_v1(${String(input.company)}::uuid,${String(input.from)}::date,${String(input.to)}::date,${Number(input.offset)}::integer) as data`;
            return result[0].data;
        }
        if (operation.operation === 'expense-post') {
            const result = await tx `select public.khata_expense_post_v2(${tx.json(input)}::jsonb) as data`;
            return result[0].data;
        }
        if (operation.operation === 'expense-report') {
            const result = await tx `select public.khata_expense_report_v2(${String(input.company)}::uuid,${String(input.from)}::date,${String(input.to)}::date,${Number(input.offset)}::integer) as data`;
            return result[0].data;
        }
        if (operation.operation === 'report') {
            const result = await tx `select public.khata_report_v1(${String(input.company)}::uuid,${String(input.from)}::date,${String(input.to)}::date,${input.party as string | null}::uuid,${Number(input.offset)}::integer) as data`;
            return result[0].data;
        }
        const result = await tx `select public.khata_post_v1(${String(input.id)}::uuid,${String(input.company)}::uuid,${String(input.party)}::uuid,${String(input.kind)},${String(input.date)}::date,${String(input.amount)},${String(input.method)},${String(input.reference)},${String(input.note)},${input.reverses as string | null}::uuid) as data`;
        return result[0].data;
    }),
});
Deno.serve(handler);
