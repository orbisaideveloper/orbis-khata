import { useState } from 'react';
import type { AccountingSellerWorkingRecord } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore';
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes';
import { useLotteryLanguage } from './language';
import { inLanguage } from '../localize';

/** Read-only view of this owner/company's existing local recovery rows. */
export function LotterySyncDetails({ label, records, workspace, warning }: Readonly<{
  label: string;
  records: AccountingSellerWorkingRecord[];
  workspace: LotteryWorkspace | null;
  warning: string | null;
}>) {
  const [open, setOpen] = useState(false);
  const language = useLotteryLanguage();
  const text = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en);
  const pending = records.filter(record => record.syncState !== 'SYNCED');
  return <div className="relative">
    <button type="button" className="lottery-sync-dot" aria-label="Accounting local sync status"
      data-sync={label === 'Synced' ? 'ok' : 'pending'} title={label}
      aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">●</span><span className="lottery-sr-only">{label}</span>
    </button>
    {open && <section aria-label="Local sync details" className="absolute right-0 z-20 w-72 max-w-[85vw] rounded-xl border border-emerald-100 bg-white p-3 text-sm text-slate-800 shadow-lg">
      <strong>{text('সিঙ্কের অবস্থা', 'सिंक की स्थिति', 'Sync status')}</strong>
      <p>{label}</p>
      {warning && <p>{text('ফোনের সংরক্ষিত তথ্য পড়তে বা পরিষ্কার করতে সমস্যা হয়েছে।', 'डिवाइस का डेटा पढ़ने या साफ करने में समस्या है।', 'Local recovery storage needs attention.')}</p>}
      {pending.length > 0 && <ul>{pending.map(record => <li key={record.key} className="mt-2 border-t border-slate-100 pt-2">
        <span>{workspace?.parties.find(party => party.id === record.partyId)?.name ?? text('পার্টি পাওয়া যায়নি', 'पार्टी नहीं मिली', 'Party unavailable')}</span>
        <span className="block">{record.occurredAt} · {record.syncState}</span>
      </li>)}</ul>}
      <p className="mt-2">{text('কোনো হিসাব মোছা হয়নি। দৈনিক এন্ট্রিতে এই পার্টি ও তারিখ পরীক্ষা করুন।', 'कोई हिसाब नहीं मिटाया गया। दैनिक एंट्री में यह पार्टी और तारीख जाँचें।', 'No records were deleted. Check the listed party and date in Daily entry.')}</p>
      <button type="button" onClick={() => setOpen(false)}>{text('বন্ধ করুন', 'बंद करें', 'Close')}</button>
    </section>}
  </div>;
}
