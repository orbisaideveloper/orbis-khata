import { DesignIcon } from './DesignIcon';
import { inLanguage } from '../localize';
import { PartyPhone } from './PartyPhone';
import { phoneHref } from '../phone';
import { textValue } from '../text-value';
import { useBookServices, type BookServices } from '../books-services';
import { confirmDelete } from '../confirm-delete';
import { useRef, useState } from 'react';
import type { Language } from '../i18n';
import { today, money } from '../accounting/model';
import { decimal, emptyPartyDetails, itemLabel, optionalMinor, type DemoItem, type DemoParty } from './master-model';
import { saveDemoItem, saveDemoParty, deleteDemoParty, deleteDemoItem } from './store';
import { masterCopy } from './master-copy';
function value(form: FormData, key: string) { return textValue(form.get(key)).trim(); }
function errorCopy(error: unknown, t: typeof masterCopy.en) {
    const message = (error as {reason?:string}).reason ?? (error as Error).message;
    if (message === 'DUPLICATE_CODE') {
        return t.duplicate;
    }
    if (message === 'UNIT_ALREADY_USED' || message === 'OPENING_ALREADY_USED') {
        return t.used;
    }
    return t.invalid;
}
function removeMaster(entity: 'item' | 'party', entry: { id: string; company: string; name: string }, language: Language, services: BookServices | null, done: () => void, fail: () => void) {
    if (!confirmDelete(language, entry.name)) { return; }
    try {
        if (services) {
            const removal = entity === 'item' ? services.deleteItem(entry.company, entry.id) : services.deleteParty(entry.company, entry.id);
            void removal.then(done, fail);
        } else if (import.meta.env.DEV) {
            if (entity === 'item') { deleteDemoItem(entry.company, entry.id); }
            else { deleteDemoParty(entry.company, entry.id); }
            done();
        }
    } catch { fail(); }
}
export function ItemMaster({ language, company, items, onChanged }: Readonly<{
    language: Language;
    company: string;
    items: DemoItem[];
    onChanged: () => void;
}>) {
    const t = masterCopy[language], guard = useRef(false), services = useBookServices();
    const [editing, setEditing] = useState<DemoItem | null>(null), [search, setSearch] = useState(''), [error, setError] = useState('');
    function save(event: React.SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editing || guard.current) {
            return;
        }
        const f = new FormData(event.currentTarget);
        guard.current = true;
        const finish = () => { setEditing(null); onChanged(); guard.current = false; }, failed = (e: unknown) => { setError(errorCopy(e, t)); guard.current = false; };
        try {
            const item = { ...editing, name: value(f, 'name'), unit: value(f, 'unit'), code: value(f, 'code'), default_rate: optionalMinor(value(f, 'rate')) };
            if (services) {
                void services.saveItem(item).then(finish, failed);
            }
            else if (import.meta.env.DEV) {
                saveDemoItem(item);
                finish();
            }
            else {
                throw new Error('LIVE_SERVICES_REQUIRED');
            }
        }
        catch (e) {
            failed(e);
        }
    }
    return <section className="books-card master-page" aria-label={t.items}>{!editing && error && <output role="alert">{error}</output>}
  {editing ? <form className="books-form" onSubmit={save}><h2>{items.some(i => i.id === editing.id) ? t.edit : t.addItem}</h2><label>{t.name}<input name="name" required maxLength={120} defaultValue={editing.name}/></label><label>{t.unit}<input name="unit" required maxLength={24} defaultValue={editing.unit} list="master-units"/></label><datalist id="master-units">{['kg', 'litre', 'piece', 'gram', 'metre', 'box'].map(unit => <option key={unit}>{unit}</option>)}</datalist><label>{t.code}<input name="code" maxLength={40} defaultValue={editing.code}/></label><label>{t.rate}<input name="rate" inputMode="decimal" defaultValue={decimal(editing.default_rate)}/></label><p className="books-hint">{t.optional}</p>{error && <output role="alert">{error}</output>}<div className="books-buttons"><button type="submit" className="books-primary">{t.save}</button><button type="button" onClick={() => setEditing(null)}>{t.cancel}</button></div></form> : <><div className="books-section-title"><h2>{t.items} ({items.length})</h2><button type="button" onClick={() => { setError(''); setEditing({ id: crypto.randomUUID(), company, name: '', unit: '', code: '', default_rate: null }); }}>＋ {t.addItem}</button></div><label>{t.search}<input type="search" value={search} onChange={e => setSearch(e.target.value)}/></label>{!items.length && <p>{t.empty}</p>}<div className="master-table-wrap"><table className="master-table master-items"><thead><tr><th>{inLanguage(language,'আইটেমের নাম','आइटम नाम','Item name')}</th><th>{t.unit}</th><th>{inLanguage(language,'দর','दर','Rate')}</th><th><span className="master-sr-only">{t.edit} / {t.remove}</span></th></tr></thead><tbody>{items.filter(i => `${i.name} ${i.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(i => <tr key={i.id}><td><strong>{itemLabel(i)}</strong></td><td>{i.unit}</td><td className="master-rate">{i.default_rate === null ? '—' : money(i.default_rate)}</td><td><div className="master-actions"><button type="button" aria-label={`${t.edit}: ${i.name}`} title={t.edit} onClick={() => { setError(''); setEditing(i); }}><DesignIcon name="edit"/></button><button type="button" title={t.remove} aria-label={`${t.remove}: ${i.name}`} onClick={() => {
                    removeMaster('item', i, language, services, onChanged, () => setError(t.deleteBlocked));
                }}><DesignIcon name="remove"/></button></div></td></tr>)}</tbody></table></div></>}
 </section>;
}
function partyOpeningLabels(customer: boolean, kind: DemoParty['kind'], t: typeof masterCopy.en) {
    if (customer) {
        return { due: t.customerDue, advance: t.customerAdvance };
    }
    if (kind === 'expense') {
        return { due: t.expenseDue, advance: t.expenseAdvance };
    }
    return { due: t.supplierDue, advance: t.supplierAdvance };
}
export function PartyMaster({ language, company, parties, onChanged, startKind, onCreated, onCancelCreate, onSelect }: Readonly<{
    language: Language;
    company: string;
    parties: DemoParty[];
    onChanged: () => void;
    onSelect?: (party:DemoParty)=>void;
    startKind?: DemoParty['kind'];
    onCreated?: (party: DemoParty) => void;
    onCancelCreate?: () => void;
}>) {
    const t = masterCopy[language], guard = useRef(false), services = useBookServices();
    const [editing, setEditing] = useState<DemoParty | null>(() => startKind ? { id: crypto.randomUUID(), company, name: '', kind: startKind, receivable: '0', payable: '0', ...emptyPartyDetails } : null), [kind, setKind] = useState<DemoParty['kind']>(startKind ?? 'customer'), [side, setSide] = useState('none'), [openingAccount, setOpeningAccount] = useState<DemoParty['opening_account']>('receivable'), [error, setError] = useState(''), [search, setSearch] = useState('');
    function begin(p: DemoParty) { setEditing(p); setKind(p.kind); setSide(p.opening_side); setOpeningAccount(p.opening_account); setError(''); }
    function save(event: React.SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editing || guard.current) {
            return;
        }
        const f = new FormData(event.currentTarget);
        guard.current = true;
        try {
            const saved: DemoParty = { ...editing, name: value(f, 'name'), kind, opening_account: openingAccount, phone: value(f, 'phone'), email: value(f, 'email'), address: value(f, 'address'), credit_limit: optionalMinor(value(f, 'credit')), credit_days: value(f, 'days') ? Number(value(f, 'days')) : null, opening_side: side as DemoParty['opening_side'], opening_amount: side === 'none' ? '0' : optionalMinor(value(f, 'opening')) ?? '0', opening_date: side === 'none' ? '' : value(f, 'date') };
            const previous=parties.find(p=>p.id===saved.id);
            if(previous&&['opening_amount','opening_side','opening_date'].some(key=>previous[key as keyof DemoParty]!==saved[key as keyof DemoParty])){
                const confirm=inLanguage(language,'পুরোনো ব্যালেন্স বদলাবেন? হিসাব আপডেট হবে।','पुराना बैलेंस बदलें? हिसाब अपडेट होगा।','Change the opening balance? Account totals will update.');
                if(!window.confirm(confirm)||!window.confirm(inLanguage(language,'শেষবার নিশ্চিত করুন—সেভ করবেন?','अंतिम पुष्टि—सहेजें?','Final confirmation — save?'))){guard.current=false;return;}
            }
            const finish = () => { setEditing(null); onChanged(); onCreated?.(saved); guard.current = false; }, failed = (e: unknown) => { setError(errorCopy(e, t)); guard.current = false; };
            if (services) {
                void services.saveParty(saved).then(finish, failed);
            }
            else if (import.meta.env.DEV) {
                saveDemoParty(saved);
                finish();
            }
            else {
                throw new Error('LIVE_SERVICES_REQUIRED');
            }
        }
        catch (e) {
            setError(errorCopy(e, t));
            guard.current = false;
        }
    }
    const customer = kind === 'customer' || kind === 'both' && openingAccount === 'receivable';
    const { due: dueLabel, advance: advanceLabel } = partyOpeningLabels(customer, kind, t);
    return <section className="books-card master-page" aria-label={t.parties}>{!editing && error && <output role="alert">{error}</output>}
  {editing ? <form className="books-form" onSubmit={save}><h2>{parties.some(p => p.id === editing.id) ? t.edit : t.addParty}</h2><label>{t.name}<input name="name" required maxLength={120} defaultValue={editing.name}/></label><label>{t.kind}<select disabled={Boolean(startKind)} value={kind} onChange={e => setKind(e.target.value as DemoParty['kind'])}>{(['customer', 'supplier', 'both', 'expense'] as const).map(k => <option key={k} value={k}>{t[k]}</option>)}</select></label><fieldset className="master-fields"><legend>{t.details}</legend><PartyPhone key={editing.id} language={language} label={t.phone} initial={editing.phone}/><label>{t.address}<textarea name="address" maxLength={400} defaultValue={editing.address}/></label><label>{t.email}<input name="email" type="email" maxLength={120} defaultValue={editing.email}/></label><label>{t.credit}<input name="credit" inputMode="decimal" defaultValue={decimal(editing.credit_limit)}/></label><label>{t.days}<input name="days" type="number" min="0" max="3650" defaultValue={editing.credit_days ?? ''}/></label></fieldset><fieldset className="master-fields"><legend>{t.opening}</legend>{kind === 'both' && <label>{t.relationship}<select value={openingAccount} onChange={e => setOpeningAccount(e.target.value as DemoParty['opening_account'])}><option value="receivable">{t.customer}</option><option value="payable">{t.supplier}</option></select></label>}<p className="books-hint">{t.openingHint}</p><label>{t.opening}<select value={side} onChange={e => setSide(e.target.value)}><option value="none">{t.none}</option><option value="due">{dueLabel}</option><option value="advance">{advanceLabel}</option></select></label>{side !== 'none' && <><label>{t.amount}<input name="opening" inputMode="decimal" required defaultValue={decimal(editing.opening_amount)}/></label><label>{t.date}<input name="date" type="date" required max={today()} defaultValue={editing.opening_date || today()}/></label></>}</fieldset>{error && <output role="alert">{error}</output>}<div className="books-buttons"><button type="submit" className="books-primary">{t.save}</button><button type="button" onClick={() => { setEditing(null); onCancelCreate?.(); }}>{t.cancel}</button></div></form> : <><div className="books-section-title"><h2>{t.parties} ({parties.length})</h2><button type="button" onClick={() => begin({ id: crypto.randomUUID(), company, name: '', kind: 'customer', receivable: '0', payable: '0', ...emptyPartyDetails })}>＋ {t.addParty}</button></div><label>{inLanguage(language,'নাম বা ফোন দিয়ে খুঁজুন','नाम या फोन से खोजें','Search by name or phone')}<input type="search" value={search} onChange={e => setSearch(e.target.value)}/></label>{!parties.length && <p>{t.empty}</p>}<div className="master-table-wrap"><table className="master-table master-parties"><thead><tr><th>{inLanguage(language,'পার্টির নাম','पार्टी नाम','Party name')}</th><th>{inLanguage(language,'ক্যাটাগরি','श्रेणी','Category')}</th><th><span className="master-sr-only">{t.edit} / {t.remove}</span></th></tr></thead><tbody>{parties.filter(p => `${p.name} ${p.phone}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p => <tr key={p.id}><td>{onSelect?<button type="button" className="party-open" onClick={()=>onSelect(p)}>{p.name}</button>:<strong>{p.name}</strong>}{p.phone && <a className="master-phone" href={phoneHref(p.phone)}>{p.phone}</a>}</td><td><span className={`master-category master-category-${p.kind}`}>{t[p.kind]}</span></td><td><div className="master-actions"><button type="button" aria-label={`${t.edit}: ${p.name}`} title={t.edit} onClick={() => begin(p)}><DesignIcon name="edit"/></button><button type="button" title={t.remove} aria-label={`${t.remove}: ${p.name}`} onClick={() => {
                    removeMaster('party', p, language, services, onChanged, () => setError(t.deleteBlocked));
                }}><DesignIcon name="remove"/></button></div></td></tr>)}</tbody></table></div></>}
 </section>;
}
