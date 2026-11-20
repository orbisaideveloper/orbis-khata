import { SellerRecoveryActions } from './SellerRecoveryActions';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AccountingSellerWorkingRecord } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore';
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes';
import { useLotteryLanguage } from './language';
import { inLanguage } from '../localize';

type Props = Readonly<{
  label: string;
  records: AccountingSellerWorkingRecord[];
  workspace: LotteryWorkspace | null;
  warning: string | null;
  onRecover?: (record: AccountingSellerWorkingRecord, mode: 'retry' | 'discard') => Promise<'confirmed' | 'discarded'>;
  onReview?: (record: AccountingSellerWorkingRecord) => Promise<boolean>;
  readFailure?: (record: AccountingSellerWorkingRecord) => Promise<string | undefined>;
}>;
const safeReasons = new Set(['SELLER_DRAFT_CONFLICT', 'SELLER_ENTRY_NOT_SAVED', 'KHATA_LOGIN_REQUIRED', 'KHATA_BUSY', 'KHATA_RATE_LIMITED', 'Failed to fetch', 'NetworkError']);

/** Displays local recovery data; never deletes or automatically resubmits a financial write. */
export function LotterySyncDetails({ label, records, workspace, warning, onReview, readFailure, onRecover }: Props) {
  const [result, setResult] = useState('');
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewBlocked, setReviewBlocked] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const language = useLotteryLanguage();
  const text = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en);
  const pending = records.filter(record => record.syncState !== 'SYNCED');
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element?.showModal) element.showModal();
    else element?.setAttribute('open', '');
    return () => element?.close?.();
  }, [open]);
  const show = async () => {
    setReviewBlocked(false);
    setOpen(true);
    if (!readFailure) return;
    const entries = await Promise.all(pending.map(async record => {
      try {
        const raw = await readFailure(record);
        const reason = raw && (safeReasons.has(raw) ? raw : raw.replaceAll(' ', '_'));
        return [record.key, reason && safeReasons.has(reason) ? reason : ''] as const;
      } catch { return [record.key, ''] as const; }
    }));
    setReasons(Object.fromEntries(entries));
  };
  return <>
    <button type="button" className="lottery-sync-dot lottery-sync-trigger" aria-label="Accounting local sync status"
      data-sync={label === 'Synced' ? 'ok' : 'pending'} title={label}
      aria-expanded={open} onClick={() => void show()}>
      <span aria-hidden="true" className="lottery-sync-light"/><span className="lottery-sr-only">{label}</span>
    </button>
    {open && createPortal(<dialog ref={dialog} aria-label="Local sync details" className="lottery-sync-dialog"
      onCancel={event => { event.preventDefault(); setOpen(false); }}>
      <header className="lottery-sync-heading">
        <h2>{text('সিঙ্কের অবস্থা', 'सिंक की स्थिति', 'Sync status')}</h2>
        <button type="button" aria-label={text('বন্ধ করুন', 'बंद करें', 'Close')} onClick={() => setOpen(false)}>×</button>
      </header>
      <p className="lottery-sync-summary">{label}</p>
      {warning && <p>{text('ফোনের সংরক্ষিত তথ্য পড়তে বা পরিষ্কার করতে সমস্যা হয়েছে।', 'डिवाइस का डेटा पढ़ने या साफ करने में समस्या है।', 'Local recovery storage needs attention.')}</p>}
      {pending.length > 0 && <ul className="lottery-sync-records">{pending.map(record => <li key={record.key}>
        <strong>{workspace?.parties.find(party => party.id === record.partyId)?.name ?? text('পার্টি পাওয়া যায়নি', 'पार्टी नहीं मिली', 'Party unavailable')}</strong>
        <p>{record.occurredAt} · {record.syncState}</p>
        {reasons[record.key] && <>
          <p>{reasons[record.key] === 'SELLER_DRAFT_CONFLICT'
            ? text('ফোনের এন্ট্রি ও সার্ভারের সংস্করণ মেলেনি। আগে এন্ট্রিটি মিলিয়ে দেখুন।', 'फोन और सर्वर की एंट्री का संस्करण नहीं मिला। पहले जाँचें।', 'The local entry and server version differ. Review the entry first.')
            : text('আগের সেভ নিশ্চিত হয়নি। এন্ট্রি খুলে বার্তাটি পরীক্ষা করুন।', 'पिछला सेव पक्का नहीं हुआ। एंट्री खोलकर संदेश जाँचें।', 'The earlier save was not confirmed. Open the entry to check the message.')}</p>
          <p className="lottery-sync-reason">{reasons[record.key]}</p>
        </>}
        {onRecover && <SellerRecoveryActions record={record} recover={onRecover} onComplete={setResult}/>}
        {onReview && <button type="button" className="lottery-sync-review" disabled={reviewing} onClick={async () => { setReviewing(true); try { if (await onReview(record)) setOpen(false); else setReviewBlocked(true); } catch { setReviewBlocked(true); } finally { setReviewing(false); } }}>{text('এন্ট্রি খুলে যাচাই করুন', 'एंट्री खोलकर जाँचें', 'Review entry')}</button>}
      </li>)}</ul>}
      {reviewBlocked && <output>{text("বর্তমান এন্ট্রির সেভ শেষ করে আবার চেষ্টা করুন।", "मौजूदा एंट्री सेव करके फिर कोशिश करें।", "Finish saving the current entry before opening another date.")}</output>}
      {result && <output>{result === 'confirmed'
        ? text('সার্ভারে এন্ট্রি নিশ্চিত হয়েছে। পুনরায় পোস্ট হয়নি।', 'सर्वर पर एंट्री की पुष्टि हुई। दोबारा पोस्ट नहीं हुई।', 'The server entry is confirmed. No duplicate was posted.')
        : text('অপেক্ষমান কপি বাদ দেওয়া হয়েছে; recovery copy আছে। সার্ভারের হিসাব রাখা হয়েছে।', 'स्थानीय बदलाव हटे; रिकवरी कॉपी है। सर्वर का हिसाब सुरक्षित है।', 'Pending changes were discarded; a recovery copy is kept. Server accounting is unchanged.')}</output>}
      <p className="lottery-sync-help">{text('তথ্য মুছে ফেলা হয়নি। এন্ট্রি খুললে বিলের অটোসেভ আবার চেষ্টা করতে পারে। পেমেন্ট নিজে থেকে পাঠানো হবে না।', 'डेटा नहीं मिटाया गया। एंट्री खोलने पर बिल का ऑटोसेव फिर कोशिश कर सकता है। भुगतान अपने आप नहीं भेजा जाएगा।', 'Your local entry is preserved. Opening it can retry the existing bill autosave. Payments are never submitted automatically.')}</p>
    </dialog>, document.body)}
  </>;
}
