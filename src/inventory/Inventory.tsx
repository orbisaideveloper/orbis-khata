import {StockTable} from './StockTable';
import {LedgerExplorer} from '../accounting/LedgerExplorer';
import { inLanguage } from '../localize';
import { confirmDelete } from '../confirm-delete';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { Language } from '../i18n';
import { useTutorial } from '../tutorial';
import { minor, money, today, type Report } from '../accounting/model';
import { rejected } from '../accounting/api';
import { inventoryReport, postInventory } from './api';
import { inventoryPendingKey, restoreInventory } from './pending';
import { inventoryCopy } from './copy';
import { billTotal, displayQuantity, inventoryCommand, lineTotal, quantity, type InventoryCommand, type InventoryKind, type InventoryReport } from './model';
type Props = {
    userId: string;
    company: string;
    companyName: string;
    language: Language;
    from: string;
    to: string;
    version: number;
    parties: Report['parties'];
    onLock: (locked: boolean) => void;
    onChanged: () => void;
    blocked: boolean;
    simple?: boolean;
};
type DraftLine = {
    key: string;
    item: string;
    warehouse: string;
    to: string;
    amount: string;
    rate: string;
};
function read(form: FormData, name: string) { const value = form.get(name); return typeof value === 'string' ? value.trim() : ''; }
function freshLine(): DraftLine { return { key: crypto.randomUUID(), item: '', warehouse: '', to: '', amount: '', rate: '' }; }
export function Inventory({ userId, company, companyName, language, from, to, version, parties, onLock, onChanged, blocked, simple = false }: Readonly<Props>) {
    const t = inventoryCopy[language], tutorial = useTutorial();
    const [offset, setOffset] = useState(0), [reload, setReload] = useState(0), [search, setSearch] = useState('');
    const query = JSON.stringify([company, from, to, version, offset, reload]);
    const valid = Boolean(from && to && from <= to);
    const [result, setResult] = useState<{
        query: string;
        data: InventoryReport | null;
    } | null>(null);
    const data = valid && result?.query === query ? result.data : null;
    const loading = valid && result?.query !== query;
    const [kind, setKind] = useState<InventoryKind | null>(null), [lines, setLines] = useState<DraftLine[]>([freshLine()]);
    const [pending, setPending] = useState<InventoryCommand | null>(() => { const p = restoreInventory(userId); return p?.company === company ? p : null; });
    const [attempted, setAttempted] = useState(Boolean(pending)), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    const [bill, setBill] = useState<InventoryReport['documents'][number] | null>(null);
    const guard = useRef(false);
    useEffect(() => {
        let alive = true;
        if (!valid) {
            return;
        }
        void inventoryReport(company, from, to, offset).then(value => {
            if (alive) {
                setResult({ query, data: value });
            }
        }, () => {
            if (alive) {
                setResult({ query, data: null });
            }
        });
        return () => { alive = false; };
    }, [company, from, to, offset, query, valid]);
    useEffect(() => { onLock(Boolean(pending) || busy); }, [pending, busy, onLock]);
    useEffect(() => {
        if (!pending) {
            return;
        }
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [pending]);
    function begin(next: InventoryKind) { setKind(next); setLines([freshLine()]); setMessage(''); }
    function change(key: string, field: keyof DraftLine, value: string) { setLines(old => old.map(line => line.key === key ? { ...line, [field]: value } : line)); }
    function review(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!kind || blocked || pending || !data) {
            return;
        }
        const form = new FormData(event.currentTarget), master = kind === 'item' || kind === 'warehouse', invoice = kind === 'sale' || kind === 'purchase';
        try {
            const command = inventoryCommand({ id: crypto.randomUUID(), company, kind, date: read(form, 'date'), code: master ? read(form, 'code') : '', name: master ? read(form, 'name') : '', unit: kind === 'item' ? read(form, 'unit') : '', party: invoice ? read(form, 'party') : null, reference: read(form, 'reference'), note: read(form, 'note'), lines: master ? [] : lines.map(line => ({ item: line.item, warehouse: line.warehouse, to: kind === 'transfer' ? line.to : null, quantity: quantity(line.amount), rate: invoice ? minor(line.rate) : '0' })) });
            if (!command || command.date > today() || (invoice && billTotal(command.lines) <= 0n)) {
                throw new Error('invalid');
            }
            setPending(command);
            setAttempted(false);
            setKind(null);
            setMessage('');
        }
        catch {
            setMessage(t.invalid);
        }
    }
    async function save() {
        if (!pending || guard.current || blocked) {
            return;
        }
        try {
            sessionStorage.setItem(inventoryPendingKey(userId), encodeURIComponent(JSON.stringify(pending)));
        }
        catch {
            setMessage(t.storage);
            return;
        }
        guard.current = true;
        setBusy(true);
        setAttempted(true);
        try {
            await postInventory(pending);
            sessionStorage.removeItem(inventoryPendingKey(userId));
            setPending(null);
            setAttempted(false);
            setMessage(t.saved);
            setReload(n => n + 1);
            onChanged();
        }
        catch (error) {
            if (rejected(error)) {
                sessionStorage.removeItem(inventoryPendingKey(userId));
                setPending(null);
                setAttempted(false);
                setMessage(t.rejected);
            }
            else {
                setMessage(t.uncertain);
            }
        }
        finally {
            guard.current = false;
            setBusy(false);
        }
    }
    function itemName(id: string) { const item = data?.items.find(row => row.id === id); return item ? `${item.code} · ${item.name} (${item.unit})` : id; }
    function locationName(id: string | null) { return data?.warehouses.find(row => row.id === id)?.name ?? id; }
    function renderLines(command: InventoryCommand) {
        const occurrences = new Map<string, number>();
        return <div className="inventory-lines">{command.lines.map(line => {
                const signature = JSON.stringify([line.item, line.warehouse, line.to, line.quantity, line.rate]);
                const occurrence = occurrences.get(signature) ?? 0;
                occurrences.set(signature, occurrence + 1);
                return <div key={`${signature}:${occurrence}`}><strong>{itemName(line.item)}</strong><span>{locationName(line.warehouse)}{line.to && <> → {locationName(line.to)}</>}</span><span>{t.quantity}: {displayQuantity(line.quantity)}</span>{['purchase', 'sale'].includes(command.kind) && <span>{t.rate}: {money(line.rate)} · {money(lineTotal(line))}</span>}</div>;
            })}</div>;
    }
    const master = kind === 'item' || kind === 'warehouse', invoice = kind === 'purchase' || kind === 'sale';
    const actions: InventoryKind[] = ['item', 'warehouse', 'purchase', 'sale', 'opening', 'transfer'];
    const demo = import.meta.env.DEV && import.meta.env.VITE_KHATA_DEMO === 'true';
    const [editing, setEditing] = useState<InventoryReport['items'][number] | null>(null);
    async function editMaster(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editing || !demo) {
            return;
        }
        const form = new FormData(event.currentTarget);
        try {
            (await import('../demo/store')).editDemoItem(editing.id, { name: read(form, 'name'), code: read(form, 'code'), unit: read(form, 'unit') });
            setEditing(null);
            setReload(n => n + 1);
        }
        catch {
            setMessage(t.invalid);
        }
    }
    const [selectedItem,setSelectedItem]=useState<{id:string;name:string}|null>(null);
    const [panel, setPanel] = useState<'items' | 'stock' | 'history'>('items');
    const panelActions = { items: ['item'], stock: ['warehouse', 'opening', 'transfer'], history: ['purchase', 'sale'] };

    if(selectedItem)return <LedgerExplorer {...{company,language,from,to,version,parties}} initialSelection={{...selectedItem,type:'item'}} onBack={()=>setSelectedItem(null)}/>;
    return <section className="books-card inventory" aria-label={t.title}>
  <h2>{t.items}</h2>{!simple && <nav className="books-navigation">{(['items', 'stock', 'history'] as const).map(view => <button type="button" key={view} aria-current={panel === view ? 'page' : undefined} disabled={Boolean(pending) || busy} onClick={() => setPanel(view)}>{t[view]}</button>)}</nav>}{tutorial && <p className="books-hint">{t.hint}</p>}
  {loading && <output>{t.loading}</output>}
  {!loading && !data && <output>{t.failed}<button type="button" onClick={() => setReload(n => n + 1)}>{t.retry}</button></output>}
  {message && <output aria-live="polite">{message}</output>}
  {data && <>
   <div className="inventory-actions">{actions.filter(action => (simple ? panelActions.items : panelActions[panel]).includes(action)).map(action => <button key={action} type="button" disabled={Boolean(pending) || busy || blocked} onClick={() => begin(action)}>{t[action]}</button>)}</div>
   {kind && !pending && <form className="books-form" onSubmit={review}>
    <h3>{t[kind]}</h3>{tutorial && master && <p>{t.masterHint}</p>}
    {master ? <input name="date" type="hidden" value={today()}/> : <label>{t.date}<input name="date" type="date" max={today()} required defaultValue={today()}/></label>}
    {master && <><label>{t.name}<input name="name" required maxLength={120}/></label><label>{t.code}<input name="code" required maxLength={40}/></label></>}
    {kind === 'item' && <><label>{t.unit}<input name="unit" required maxLength={24} list={`inventory-units-${company}`}/></label><datalist id={`inventory-units-${company}`}>{[...new Set(['kg', 'litre', 'piece', 'gram', 'metre', 'box', ...data.items.map(item => item.unit)])].map(unit => <option key={unit} value={unit}/>)}</datalist>{tutorial && <p>{t.unitHint}</p>}</>}
    {invoice && <label>{t.party}<select name="party" required defaultValue=""><option value="">{t.choose}</option>{parties.filter(p => p.kind !== 'expense').filter(p => kind === 'sale' ? p.kind !== 'supplier' : p.kind !== 'customer').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {!master && <>{lines.map((line, index) => <fieldset className="inventory-line-form" key={line.key}><legend>{index + 1}</legend>
     <label>{t.items}<select required value={line.item} onChange={e => change(line.key, 'item', e.target.value)}><option value="">{t.choose}</option>{data.items.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name} ({item.unit})</option>)}</select></label>
     <label>{t.location}<select required value={line.warehouse} onChange={e => change(line.key, 'warehouse', e.target.value)}><option value="">{t.choose}</option>{data.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
     {kind === 'transfer' && <label>{t.destination}<select required value={line.to} onChange={e => change(line.key, 'to', e.target.value)}><option value="">{t.choose}</option>{data.warehouses.filter(w => w.id !== line.warehouse).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
     <label>{t.quantity}<input required inputMode="decimal" value={line.amount} onChange={e => change(line.key, 'amount', e.target.value)}/></label>
     {invoice && <label>{t.rate}<input required inputMode="decimal" value={line.rate} onChange={e => change(line.key, 'rate', e.target.value)}/></label>}
     <button type="button" disabled={lines.length === 1} onClick={() => {
                            if (confirmDelete(language, String(lines.indexOf(line) + 1))) {
                                setLines(old => old.filter(row => row.key !== line.key));
                            }
                        }}>{t.remove}</button>
    </fieldset>)}<button type="button" disabled={lines.length >= 50} onClick={() => setLines(old => [...old, freshLine()])}>{t.addLine}</button></>}
    {!master && <><label>{t.reference}<input name="reference" maxLength={80}/></label><label>{t.note}<textarea name="note" maxLength={500} required={kind === 'opening' || kind === 'transfer'}/></label></>}
    <div className="books-buttons"><button type="submit" disabled={blocked}>{t.review}</button><button type="button" onClick={() => setKind(null)}>{t.cancel}</button></div>
   </form>}
   {pending && <div className="books-confirm" aria-label={t.review}><h3>{t.review}: {t[pending.kind]}</h3><p>{companyName} · {pending.date}</p><p>{pending.code} {pending.name} {pending.unit}</p><p>{parties.find(p => p.id === pending.party)?.name}</p>{renderLines(pending)}<p>{pending.reference} {pending.note}</p>{['purchase', 'sale'].includes(pending.kind) && <strong>{t.total}: {money(billTotal(pending.lines))}</strong>}<div className="books-buttons"><button type="button" disabled={busy || blocked} onClick={() => { void save(); }}>{attempted ? t.retry : t.confirm}</button>{!attempted && <button type="button" onClick={() => setPending(null)}>{t.cancel}</button>}</div></div>}
   {editing && <form className="books-form" onSubmit={editMaster}><h3>{inLanguage(language, 'আইটেম এডিট', 'आइटम बदलें', 'Edit item')}</h3><label>{t.name}<input name="name" required maxLength={120} defaultValue={editing.name}/></label><label>{t.code}<input name="code" required maxLength={40} defaultValue={editing.code}/></label><label>{t.unit}<input name="unit" required maxLength={24} defaultValue={editing.unit}/></label><button type="submit">{t.confirm}</button><button type="button" onClick={() => setEditing(null)}>{t.cancel}</button></form>}
   <label className="stock-search">{<input aria-label={t.search} placeholder={t.search} type="search" value={search} onChange={e => setSearch(e.target.value)}/>}</label><div hidden={panel !== 'items'}>
   {panel==='items'&&<StockTable data={data} language={language} search={search} onSelect={(id,name)=>setSelectedItem({id,name})} onEdit={demo?setEditing:undefined}/>}

   </div><div hidden={panel !== 'stock'}><h3>{t.warehouses}</h3>{data.warehouses.map(w => <p key={w.id}>{w.code} · {w.name}</p>)}
   {panel==='stock'&&<StockTable data={data} language={language} search={search} onSelect={(id,name)=>setSelectedItem({id,name})} onEdit={demo?setEditing:undefined}/>}

   </div><div hidden={panel !== 'history'}><h3>{t.history} ({data.count})</h3>{data.documents.map(doc => <article className="inventory-stock" key={doc.id}><strong>{t[doc.kind]} · {doc.date} · {doc.reference}</strong>{doc.reversed && <span>{t.reversed}</span>}<button type="button" onClick={() => setBill(doc)}>{t.view}</button></article>)}
   <div className="books-buttons"><button type="button" disabled={!offset} onClick={() => setOffset(n => Math.max(0, n - 50))}>{t.previous}</button><span>{Math.floor(offset / 50) + 1}</span><button type="button" disabled={offset + 50 >= data.count} onClick={() => setOffset(n => n + 50)}>{t.next}</button></div>
  </div></>}
  {bill && <section className="inventory-print" aria-label={t.invoice}><h2>{companyName}</h2><h3>{t[bill.kind]}</h3><p>{bill.reference} · {bill.date}</p><p>{bill.party_name}</p>{renderLines(bill)}{['sale', 'purchase'].includes(bill.kind) && <strong>{t.total}: {money(bill.total)}</strong>}<p>{bill.note}</p><small>ID: {bill.id}</small>{bill.reversed && <p>{t.reversed}</p>}<div className="books-buttons"><button type="button" onClick={() => window.print()}>{t.print}</button><button type="button" onClick={() => setBill(null)}>{t.close}</button></div></section>}
 </section>;
}
