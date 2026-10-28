import { readWorkspacePending, saveWorkspacePending, clearWorkspacePending } from './workspace-pending';
import { rejected } from './api';
import { useState } from 'react';
import type { Language } from '../i18n';
import { inLanguage } from '../localize';
import { money, minor, today, type Report } from './model';
import { useWorkspaceSettings } from './use-settings';
import { billError } from './business-error';
export function PaymentEntry({ company, language, report, onChanged, userId = 'demo-owner' }: Readonly<{
    company: string;
    language: Language;
    report: Report | null;
    onChanged: () => void;
    userId?: string;
}>) {
    const { request, settings } = useWorkspaceSettings(company), [kind, setKind] = useState<'receipt' | 'payment'>('receipt'), [party, setParty] = useState(''), [amount, setAmount] = useState(''), [account, setAccount] = useState('cash'), [date, setDate] = useState(today), [reference, setReference] = useState(''), [note, setNote] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [pending, setPending] = useState<Record<string, unknown> | null>(() => readWorkspacePending(userId, company));
    const l = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en);
    async function save() {
        setBusy(true);
        try {
            const command = pending ?? { company, action: 'payment', id: crypto.randomUUID(), party, kind, date, amount: minor(amount), account, reference, note };
            if (!pending && !window.confirm(l('এই পেমেন্ট সেভ করবেন?', 'यह भुगतान सहेजें?', 'Save this payment?') + '\n' + money(String(command.amount)))) {
                return;
            }
            saveWorkspacePending(userId, company, command);
            setPending(command);
            await request('workspace', command);
            clearWorkspacePending(userId, company);
            setPending(null);
            setAmount('');
            setReference('');
            setNote('');
            setMessage(l('পেমেন্ট সেভ হয়েছে।', 'भुगतान सहेजा गया।', 'Payment saved.'));
            onChanged();
        }
        catch (error) {
            if (rejected(error)) {
                clearWorkspacePending(userId, company);
                setPending(null);
            }
            setMessage(billError(error, language, l('সেভ নিশ্চিত হয়নি। একই এন্ট্রি আবার চেষ্টা করুন।', 'सेव निश्चित नहीं है। वही एंट्री फिर कोशिश करें।', 'Save not confirmed. Retry the same entry.')));
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="books-card workspace-settings"><h2>{l('জমা / পেমেন্ট', 'जमा / भुगतान', 'Receive / pay')}</h2><form onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy || Boolean(pending)}><label>{l('ধরন', 'प्रकार', 'Type')}<select value={kind} onChange={e => { setKind(e.target.value as 'receipt' | 'payment'); setParty(''); }}><option value="receipt">{l('টাকা জমা', 'पैसे प्राप्त', 'Receive money')}</option><option value="payment">{l('টাকা দেওয়া', 'पैसे देना', 'Pay money')}</option></select></label><label>{l('পার্টি', 'पार्टी', 'Party')}<select required value={party} onChange={e => setParty(e.target.value)}><option value="">{l('বেছে নিন', 'चुनें', 'Choose')}</option>{report?.parties.filter(p => p.kind === 'both' || p.kind === (kind === 'receipt' ? 'customer' : 'supplier')).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{l('তারিখ', 'तारीख', 'Date')}<input required type="date" max={today()} value={date} onChange={e => setDate(e.target.value)}/></label><label>{l('টাকা', 'रकम', 'Amount')}<input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label><label>{l('অ্যাকাউন্ট', 'खाता', 'Account')}<select value={account} onChange={e => setAccount(e.target.value)}>{settings.accounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>{l('রেফারেন্স (ঐচ্ছিক)', 'संदर्भ (वैकल्पिक)', 'Reference (optional)')}<input maxLength={80} value={reference} onChange={e => setReference(e.target.value)}/></label><label>{l('বিবরণ', 'विवरण', 'Description')}<input maxLength={500} value={note} onChange={e => setNote(e.target.value)}/></label></fieldset><p>{l('টাকা কম থাকলেও পেমেন্ট হবে; ব্যালেন্স মাইনাস দেখাবে।', 'रकम कम होने पर भी भुगतान होगा; बैलेंस ऋणात्मक दिखेगा।', 'Payments can make the account balance negative.')}</p><button type="submit" disabled={busy}>{pending ? l('একই পেমেন্ট আবার পাঠান', 'वही भुगतान फिर भेजें', 'Retry same payment') : l('যাচাই ও সেভ', 'जाँचें और सहेजें', 'Review & save')}</button></form>{message && <output>{message}</output>}</section>;
}
