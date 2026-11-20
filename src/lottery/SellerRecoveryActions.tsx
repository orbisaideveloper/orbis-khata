import { SellerRecoveryConflict } from './seller-recovery';
import { formatPaise } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney';
import { useState } from 'react';
import type { AccountingSellerWorkingRecord } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore';
import { useLotteryLanguage } from './language';
import { inLanguage } from '../localize';

type Recovery = (record: AccountingSellerWorkingRecord, mode: 'retry' | 'discard') => Promise<'confirmed' | 'discarded'>;
export function SellerRecoveryActions({ record, recover, onComplete }: Readonly<{
  record: AccountingSellerWorkingRecord; recover: Recovery; onComplete: (result: 'confirmed' | 'discarded') => void;
}>) {
  const [server, setServer] = useState<SellerRecoveryConflict['server']>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const language = useLotteryLanguage();
  const text = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en);
  const run = async (mode: 'retry' | 'discard') => {
    if (busy) return;
    setBusy(true); setError(''); setServer(null);
    try { onComplete(await recover(record, mode)); setConfirm(false); }
    catch (cause) {
      if (cause instanceof SellerRecoveryConflict) setServer(cause.server);
      const code = cause instanceof Error ? cause.message : '';
      setError(code === 'RECOVERY_SERVER_DIFFERS'
        ? text('সার্ভারের তথ্য আলাদা। জোর করে সেভ হয়নি। অপেক্ষমান কপি বাদ দিলে সার্ভারের হিসাব থাকবে।', 'सर्वर की एंट्री अलग है। जबरन सेव नहीं हुआ। स्थानीय बदलाव हटाने पर सर्वर का हिसाब रहेगा।', 'Server data differs. Nothing was overwritten. Discarding pending changes keeps the server entry.')
        : text('সেভ নিশ্চিত হয়নি বা এন্ট্রি বদলেছে। তথ্য রাখা আছে; আবার পরীক্ষা করুন।', 'सेव की पुष्टि नहीं हुई या एंट्री बदली है। डेटा सुरक्षित है; फिर जाँचें।', 'Save was not confirmed or the entry changed. Data is preserved; check again.'));
    } finally { setBusy(false); }
  };
  return <div className="lottery-recovery-actions">
    <dl className="lottery-recovery-values">
      <div><dt>{text('পাঠানো', 'भेजे', 'Dispatch')}</dt><dd>{record.row.dispatchQuantity}</dd></div>
      <div><dt>{text('ফেরত সকাল / দিন / রাত', 'वापसी सुबह / दिन / रात', 'Returns AM / day / PM')}</dt><dd>{record.row.morningReturnQuantity} / {record.row.dayReturnQuantity} / {record.row.eveningReturnQuantity}</dd></div>
      <div><dt>{text('কমিশন', 'कमीशन', 'Commission')}</dt><dd>₹{record.row.commissionRupees}</dd></div>
    </dl>
    <div className="lottery-recovery-buttons">
      <button type="button" disabled={busy} onClick={() => void run('retry')}>{text('আবার সেভ করুন', 'फिर सेव करें', 'Retry save')}</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(true)}>{text('অপেক্ষমান পরিবর্তন বাদ দিন', 'स्थानीय बदलाव हटाएँ', 'Discard pending changes')}</button>
    </div>
    {confirm && <div className="lottery-recovery-confirm">
      <p>{text('শুধু এই অপেক্ষমান পরিবর্তন বাদ যাবে। recovery copy থাকবে। সার্ভারের বিল বা পেমেন্ট মুছবে না।', 'केवल यह स्थानीय बदलाव हटेगा। रिकवरी कॉपी रहेगी। सर्वर का बिल या भुगतान नहीं मिटेगा।', 'Only these pending changes will be discarded. A recovery copy is kept. Server bills and payments will remain.')}</p>
      <button type="button" disabled={busy} onClick={() => void run('discard')}>{text('নিশ্চিত করে বাদ দিন', 'हटाने की पुष्टि करें', 'Confirm discard')}</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(false)}>{text('বাতিল', 'रद्द करें', 'Cancel')}</button>
    </div>}
    {busy && <output>{text('যাচাই হচ্ছে…', 'जाँच हो रही है…', 'Checking…')}</output>}
    {server && <div className="lottery-recovery-confirm"><strong>{text('সার্ভারে সংরক্ষিত', 'सर्वर पर सहेजा', 'Saved on server')}</strong><p>{text('পাঠানো', 'भेजे', 'Dispatch')}: {server.dispatch}</p><p>{text('ফেরত', 'वापसी', 'Returns')}: {server.returns}</p><p>{text('কমিশন', 'कमीशन', 'Commission')}: {formatPaise(server.commissionPaise)}</p></div>}
    {error && <output>{error}</output>}
  </div>;
}
