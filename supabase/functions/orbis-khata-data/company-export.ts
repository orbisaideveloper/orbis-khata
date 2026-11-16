import type postgres from 'npm:postgres@3.4.7';

// One statement gives every table the same PostgreSQL snapshot. The company
// CTE scopes each read to an active company owned by the verified ledger owner.
export async function exportCompany(tx: postgres.TransactionSql, company: string, owner: string) {
    const rows = await tx`
        with owned as (
            select id, name from public.khata_companies
            where id = ${company}::uuid and owner_id = ${owner}::uuid and deleted_at is null
        )
        select jsonb_build_object(
            'version', 1,
            'company', to_jsonb(c),
            'balances', coalesce((select jsonb_object_agg(account, balance::text) from (
                select account, sum(signed_minor) balance from public.khata_journal
                where company_id=c.id group by account
            ) ledger),'{}'),
            'unsupported', exists(select 1 from public.khata_opening_expense_payments where company_id=c.id),
            'parties', coalesce((select jsonb_agg(
                (to_jsonb(p)-'company_id'-'created_at') || jsonb_build_object(
                    'company',c.id,'credit_limit',p.credit_limit::text,'opening_amount',p.opening_amount::text,
                    'opening_date',coalesce(p.opening_date::text,''),'receivable','0','payable','0')
                order by p.id) from public.khata_parties p where p.company_id=c.id),'[]'),
            'entries', coalesce((select jsonb_agg(jsonb_build_object(
                'id',v.id,'company',c.id,'party_id',v.party_id,'party_name',p.name,
                'kind',v.kind,'effective_date',v.effective_date,'amount_minor',v.amount_minor::text,
                'debit_account',v.debit_account,'credit_account',v.credit_account,'reference',v.reference,
                'note',v.note,'reverses_id',v.reverses_id,
                'reversed',exists(select 1 from public.khata_vouchers r where r.company_id=c.id and r.reverses_id=v.id))
                order by v.effective_date,v.created_at,v.id)
                from public.khata_vouchers v join public.khata_parties p on p.company_id=c.id and p.id=v.party_id
                where v.company_id=c.id),'[]'),
            'expenses', coalesce((select jsonb_agg(e.payload order by e.effective_date,e.created_at,e.id)
                from public.khata_expense_events e where e.company_id=c.id),'[]'),
            'expenseBillLines', coalesce((select jsonb_object_agg(id,lines) from public.khata_expense_bill_lines where company_id=c.id),'{}'),
            'documents', coalesce((select jsonb_agg(d.payload || jsonb_build_object(
                'total',d.total_minor::text,'party_name',p.name,
                'reversed',exists(select 1 from public.khata_stock_reversals r where r.company_id=c.id and r.original_id=d.id))
                order by d.effective_date,d.created_at,d.id)
                from public.khata_inventory_documents d
                left join public.khata_parties p on p.company_id=c.id and p.id::text=d.payload->>'party'
                where d.company_id=c.id and d.kind not in ('item','warehouse')),'[]'),
            'reversals', coalesce((select jsonb_agg(jsonb_build_array(original_id,reversal_date) order by original_id)
                from (select original_id,min(effective_date) as reversal_date from public.khata_stock_reversals
                      where company_id=c.id group by original_id) r),'[]'),
            'items', coalesce((select jsonb_agg((to_jsonb(i)-'company_id') ||
                jsonb_build_object('company',c.id,'default_rate',i.default_rate::text) order by i.id)
                from public.khata_items i where i.company_id=c.id),'[]'),
            'warehouses', coalesce((select jsonb_agg((to_jsonb(w)-'company_id') ||
                jsonb_build_object('company',c.id) order by w.id)
                from public.khata_warehouses w where w.company_id=c.id),'[]'),
            'paymentLinks', coalesce((select jsonb_object_agg(id,jsonb_build_object('bill',bill_id,'account',account_id))
                from public.khata_payment_links where company_id=c.id),'{}'),
            'settings', (select settings from public.khata_workspace_settings where company_id=c.id),
            'expenseProfiles', (select state from public.khata_expense_profile_state where company_id=c.id),
            'productionRoutes', coalesce((select jsonb_object_agg(invoice_id,jsonb_build_object('input',input_id))
                from public.khata_production_routes where company_id=c.id),'{}'),
            'fiscalCounters', coalesce((select jsonb_object_agg(c.id::text||':'||kind||':'||fiscal_year,next_serial::text)
                from public.khata_fiscal_counters where company_id=c.id),'{}')
        ) as snapshot from owned c
    `;
    if (!rows.length) throw Object.assign(new Error('COMPANY_NOT_ACCESSIBLE'), { code: 'P0001' });
    return rows[0].snapshot;
}
