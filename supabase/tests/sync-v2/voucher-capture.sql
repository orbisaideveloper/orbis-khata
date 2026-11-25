-- Disposable integration: the voucher INSERT owns emission for v1 and v2.
create table sync_v2.voucher_event (
  voucher_id uuid primary key,
  actor_id text not null,
  kind text not null check (kind = 'company'),
  scope_id text not null,
  epoch text not null,
  seq bigint not null,
  foreign key (actor_id, kind, scope_id, epoch, seq)
    references sync_v2.event(actor_id, kind, scope_id, epoch, seq)
);
revoke all on sync_v2.voucher_event from public;

create function sync_v2.capture_voucher() returns trigger
language plpgsql security definer set search_path = '' as $$
declare captured sync_v2.scope;
  projection jsonb;
begin
  update sync_v2.scope as s set head = s.head + 1
  from public.khata_companies c
  join orbis_khata.principals p on p.ledger_owner_id = c.owner_id
  where c.id = new.company_id and s.actor_id = p.orbis_identity_id::text
    and s.kind = 'company' and s.scope_id = c.id::text and s.lifecycle = 'active'
  returning s.* into captured;
  if not found then
    perform sync_v2.assert_unenrolled_company(new.company_id);
    return new;
  end if;

  projection := jsonb_build_object('entityType','voucher','entityId',new.id,'projectionJson',to_jsonb(new)::text);
  if new.kind = 'reversal' then
    -- The stock and production reversal triggers sort before this capture trigger.
    projection := projection || jsonb_build_object('stockReversals',(
      select coalesce(jsonb_agg(to_jsonb(r)::text order by r.ordinal),'[]'::jsonb)
      from public.khata_stock_reversals r
      where r.company_id=new.company_id and r.voucher_id=new.id
    ));
  end if;
  insert into sync_v2.event values (captured.actor_id, captured.kind, captured.scope_id,
    captured.epoch, captured.head, null, jsonb_build_array(projection));
  insert into sync_v2.voucher_event values (new.id, captured.actor_id, captured.kind,
    captured.scope_id, captured.epoch, captured.head);
  return new;
end;
$$;
revoke all on function sync_v2.capture_voucher() from public;
create trigger zz_sync_v2_capture_voucher after insert on public.khata_vouchers
for each row execute function sync_v2.capture_voucher();

create function sync_v2.finish_voucher(a text, s text, e text, op text, d text, r jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare event_seq bigint;
begin
  select seq into strict event_seq from sync_v2.voucher_event
  where voucher_id = (r->>'entityId')::uuid and actor_id = a and scope_id = s and epoch = e;
  insert into sync_v2.receipt values (a, 'company', s, e, op, d, event_seq, r);
  return event_seq;
end;
$$;
revoke all on function sync_v2.finish_voucher(text,text,text,text,text,jsonb) from public;
