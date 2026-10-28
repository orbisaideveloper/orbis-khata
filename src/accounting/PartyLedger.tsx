import { ExpenseRecordDetail } from './ExpenseRecordDetail';
import { useState } from 'react';
import type { Language } from '../i18n';
import { inLanguage } from '../localize';
import { DesignIcon } from '../demo/DesignIcon';
import { money, type Report } from './model';
import { ledgerRows } from './ledger-model';
import { RecordDetail } from './RecordDetail';
const labels = {
    bn: { date: 'তারিখ', reference: 'বিল নং', kind: 'ধরন', bill: 'বিল', paid: 'জমা/দেওয়া', balance: 'ব্যালেন্স', opening: 'আগের ব্যালেন্স', total: 'মোট', sale: 'সেল', purchase: 'পারচেজ', receipt: 'জমা', payment: 'পেমেন্ট', reversal: 'সংশোধন', edit: 'এডিট', remove: 'ডিলিট', description: 'বিবরণ', due: 'আগের বাকি', advance: 'অ্যাডভান্স' },
    en: { date: 'Date', reference: 'Bill no.', kind: 'Type', bill: 'Bill', paid: 'Received/paid', balance: 'Balance', opening: 'Opening balance', total: 'Total', sale: 'Sale', purchase: 'Purchase', receipt: 'Receipt', payment: 'Payment', reversal: 'Correction', edit: 'Edit', remove: 'Delete', description: 'Description', due: 'Previous due', advance: 'Advance' },
    hi: { date: 'तारीख', reference: 'बिल नं.', kind: 'प्रकार', bill: 'बिल', paid: 'जमा/भुगतान', balance: 'बैलेंस', opening: 'पुराना बैलेंस', total: 'कुल', sale: 'बिक्री', purchase: 'खरीद', receipt: 'जमा', payment: 'भुगतान', reversal: 'सुधार', edit: 'बदलें', remove: 'मिटाएँ', description: 'विवरण', due: 'पुराना बकाया', advance: 'एडवांस' },
};
export function PartyLedger({ data, language, company, from, to, name, onChanged, source = 'voucher' }: Readonly<{
    data: Report;
    language: Language;
    company: string;
    from: string;
    to: string;
    name: string;
    onChanged: () => void;
    source?: 'voucher' | 'expense';
}>) {
    const t = { ...labels[language] }, result = ledgerRows(data, from), [detail, setDetail] = useState<{
        id: string;
        mode: 'view' | 'edit' | 'delete';
    } | null>(null), [description, setDescription] = useState(true), [exporting, setExporting] = useState(false), [error, setError] = useState('');
    if (source === 'expense') {
        t.purchase = inLanguage(language, 'খরচ', 'खर्च', 'Expense');
    }
    async function download(kind: 'pdf' | 'xlsx' | 'share') {
        setExporting(true);
        setError('');
        try {
            const { exportLedger } = await import('./ledger-export');
            await exportLedger({ name, from, to, headings: [t.date, t.reference, t.kind, t.description, t.bill, t.paid, t.balance], rows: result.rows.map(row => [row.date, row.reference, t[row.kind as keyof typeof t] ?? row.kind, row.description, money(row.bill), money(row.paid), money(row.balance)]), opening: money(result.opening), totals: [t.total, money(result.bills), money(result.payments), money(result.closing)] }, kind);
        }
        catch {
            setError(inLanguage(language, 'ডাউনলোড তৈরি হয়নি। আবার চেষ্টা করুন।', 'डाउनलोड नहीं बना। फिर कोशिश करें।', 'Could not prepare download. Retry.'));
        }
        finally {
            setExporting(false);
        }
    }
    return <><details className="ledger-settings"><summary>{inLanguage(language, 'লেজার সেটিংস', 'लेजर सेटिंग्स', 'Ledger settings')}</summary><label><input type="checkbox" checked={description} onChange={event => setDescription(event.target.checked)}/>{t.description}</label></details><div className="ledger-export"><button disabled={exporting} type="button" onClick={() => { void download('pdf'); }}>PDF</button><button disabled={exporting} type="button" onClick={() => { void download('xlsx'); }}>Excel</button><button disabled={exporting} type="button" onClick={() => { void download('share'); }}>{inLanguage(language, 'শেয়ার', 'शेयर', 'Share')}</button></div>
 <p className="ledger-opening">{t.opening}: {money(result.opening)}</p><p className="ledger-sign-hint">{inLanguage(language, 'ব্যালেন্স: + পাওনা / − দেনা', 'बैलेंस: + लेना / − देना', 'Balance: + to receive / − to pay')}</p>
 <div className="professional-ledger"><table><thead><tr>{[t.date, t.reference, t.kind, t.bill, t.paid, t.balance].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{result.rows.map(row => <tr key={row.id}><td>{row.date.slice(8)}.{row.date.slice(5, 7)}<small>{row.date.slice(0, 4)}</small></td><td><button type="button" title={row.reference} disabled={!row.voucher} onClick={() => setDetail({ id: row.id, mode: 'view' })}>{row.reference || '—'}</button></td><td>{t[row.kind as keyof typeof t] ?? row.kind}{description && row.description && <small>{t[row.description as keyof typeof t] ?? row.description}</small>}{row.voucher && row.kind !== 'reversal' && !row.voucher.reversed && <span className="ledger-actions"><button type="button" aria-label={t.edit + ': ' + (row.reference || row.id)} onClick={() => setDetail({ id: row.id, mode: 'edit' })}><DesignIcon name="edit"/></button><button type="button" aria-label={t.remove + ': ' + (row.reference || row.id)} onClick={() => setDetail({ id: row.id, mode: 'delete' })}><DesignIcon name="remove"/></button></span>}</td><td>{row.bill ? money(row.bill) : '—'}</td><td>{row.paid ? money(row.paid) : '—'}</td><td>{money(row.balance)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>{t.total}</th><td>{money(result.bills)}</td><td>{money(result.payments)}</td><td>{money(result.closing)}</td></tr></tfoot></table></div>{error && <output role="alert">{error}</output>}
 {detail && source === 'expense' && <ExpenseRecordDetail company={company} id={detail.id} language={language} mode={detail.mode} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); onChanged(); }}/>}
 {detail && source === 'voucher' && <RecordDetail company={company} id={detail.id} mode={detail.mode} language={language} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); onChanged(); }}/>}</>;
}
