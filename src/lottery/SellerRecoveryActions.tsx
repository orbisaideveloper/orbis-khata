import type { RecoverySale, SellerRecoverySnapshot } from './seller-recovery-contract';
import { SellerRecoveryConflict, type RecoveryMode } from './seller-recovery';
import { formatPaise } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney';
import { useCallback, useEffect, useState } from 'react';
import type { AccountingSellerWorkingRecord } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore';
import { useLotteryLanguage } from './language';
import { inLanguage } from '../localize';

type Recovery = (record: AccountingSellerWorkingRecord, mode: RecoveryMode, reviewed?: RecoverySale | null) => Promise<'confirmed' | 'discarded'>;
export function SellerRecoveryActions({ record, recover, onComplete, inspect }: Readonly<{
  inspect?: (record: AccountingSellerWorkingRecord) => Promise<SellerRecoverySnapshot>;
  record: AccountingSellerWorkingRecord; recover: Recovery; onComplete: (result: 'confirmed' | 'discarded') => void;
}>) {
  const [server, setServer] = useState<SellerRecoveryConflict['server']>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [keep, setKeep] = useState(false);
  const [snapshot, setSnapshot] = useState<SellerRecoverySnapshot | null>(null);
  const [reading, setReading] = useState(Boolean(inspect));
  const [error, setError] = useState('');
  const language = useLotteryLanguage();
  const text = useCallback((bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en), [language]);
  useEffect(() => {
    if (!inspect) return;
    let cancelled=false;
    void Promise.resolve().then(() => {
      if(cancelled) return null;
      setReading(true); setSnapshot(null); setError('');
      return inspect(record);
    }).then(value=>{if(!cancelled && value)setSnapshot(value);}).catch(()=>{
      if(!cancelled)setError(text('সার্ভারের এন্ট্রি পড়া যায়নি। সংযোগ ও নতুন সার্ভার আপডেট পরীক্ষা করে পপআপ আবার খুলুন।','सर्वर एंट्री नहीं पढ़ी गई। कनेक्शन और सर्वर अपडेट जाँचकर फिर खोलें।','Could not read this server entry. Check the connection and server update, then reopen this dialog.'));
    }).finally(()=>{if(!cancelled)setReading(false);});
    return ()=>{cancelled=true;};
  }, [inspect, record, text]);
  const target = snapshot ? [...snapshot.draftSales, ...snapshot.sales][0] ?? null : null;
  const run = async (mode: RecoveryMode) => {
    if (busy || reading) return;
    setBusy(true); setError(''); setServer(null);
    try { onComplete(await (mode === 'keep-local' ? recover(record, mode, target) : recover(record, mode))); setConfirm(false); setKeep(false); }
    catch (cause) {
      if (cause instanceof SellerRecoveryConflict) setServer(cause.server);
      const code = cause instanceof Error ? cause.message.replaceAll(' ', '_') : '';
      const known: Record<string, string> = {
        RECOVERY_BUSY: text('অটোসেভ চলছে। শেষ হলে আবার চেষ্টা করুন।','ऑटोसेव जारी है। पूरा होने पर फिर करें।','Autosave is running. Wait for it to finish, then retry.'),
        RECOVERY_LOCAL_CHANGED: text('ফোনের এন্ট্রি বদলেছে। সর্বশেষ তথ্য দেখতে পপআপ আবার খুলুন।','फोन की एंट्री बदली है। ताज़ा जानकारी के लिए फिर खोलें।','The phone entry changed. Reopen this dialog to review the latest values.'),
        SELLER_DRAFT_CONFLICT: text('সার্ভারের সংস্করণ বদলেছে। তুলনা আবার খুলে যাচাই করুন।','सर्वर संस्करण बदला है। फिर तुलना करें।','The server revision changed. Reopen the comparison before confirming.'),
        RECOVERY_SERVER_CHANGED: text('সার্ভারের এন্ট্রি আবার বদলেছে। তুলনা আবার খুলে যাচাই করুন।','सर्वर एंट्री फिर बदली है। दोबारा तुलना करें।','The server entry changed again. Reopen the comparison before confirming.'),
        RECOVERY_POSTED_ENTRY: text('এই বিল পোস্ট করা আছে। এখানে বদলানো যাবে না; মূল এন্ট্রির সংশোধন ব্যবহার করুন।','यह बिल पोस्ट हो चुका है। मूल एंट्री का सुधार उपयोग करें।','This bill is posted. Use the original entry correction instead.'),
        RECOVERY_OPERATION_MISSING: text('মূল অপেক্ষমান অপারেশন নেই। কপি বাদ দিয়ে সার্ভারের সঠিক এন্ট্রি খুলুন।','मूल स्थानीय ऑपरेशन नहीं है। स्थानीय कॉपी हटाकर सही सर्वर एंट्री खोलें।','The original pending operation is unavailable. Keep the server entry and reopen it.'),
      };
      setError(known[code] ?? (code === 'RECOVERY_SERVER_DIFFERS'
        ? text('সার্ভারের তথ্য আলাদা। জোর করে সেভ হয়নি। অপেক্ষমান কপি বাদ দিলে সার্ভারের হিসাব থাকবে।', 'सर्वर की एंट्री अलग है। जबरन सेव नहीं हुआ। स्थानीय बदलाव हटाने पर सर्वर का हिसाब रहेगा।', 'Server data differs. Nothing was overwritten. Discarding pending changes keeps the server entry.')
        : text('সেভ নিশ্চিত হয়নি বা এন্ট্রি বদলেছে। তথ্য রাখা আছে; আবার পরীক্ষা করুন।', 'सेव की पुष्टि नहीं हुई या एंट्री बदली है। डेटा सुरक्षित है; फिर जाँचें।', 'Save was not confirmed or the entry changed. Data is preserved; check again.')));
    } finally { setBusy(false); }
  };
  return <div className="lottery-recovery-actions">
    <dl className="lottery-recovery-values">
      <div><dt>{text('পাঠানো', 'भेजे', 'Dispatch')}</dt><dd>{record.row.dispatchQuantity}</dd></div>
      <div><dt>{text('ফেরত সকাল / দিন / রাত', 'वापसी सुबह / दिन / रात', 'Returns AM / day / PM')}</dt><dd>{record.row.morningReturnQuantity} / {record.row.dayReturnQuantity} / {record.row.eveningReturnQuantity}</dd></div>
      <div><dt>{text('কমিশন', 'कमीशन', 'Commission')}</dt><dd>₹{record.row.commissionRupees}</dd></div>
    </dl>
    {reading && <output>{text('সার্ভারের এন্ট্রি পড়া হচ্ছে…','सर्वर एंट्री पढ़ रहे हैं…','Reading this server entry…')}</output>}
    {snapshot && <div className="lottery-recovery-comparison">
      <h3>{text('ফোন ও সার্ভারের তুলনা','फोन और सर्वर की तुलना','Phone and server comparison')}</h3>
      <table><thead><tr><th>{text('তথ্য','जानकारी','Field')}</th><th>{text('ফোন','फोन','Phone')}</th><th>{text('সার্ভার','सर्वर','Server')}</th></tr></thead><tbody>
        {[
          [text('তারিখ','तारीख','Date'), record.occurredAt, snapshot.occurredAt],
          [text('বিল','बिल','Bill'), record.row.reference || '—', target?.reference || '—'],
          [text('পাঠানো','भेजे','Dispatch'), record.row.dispatchQuantity, target?.dispatchQuantity ?? '—'],
          [text('ফেরত সকাল / দিন / রাত','वापसी सुबह / दिन / रात','Returns AM / day / PM'), `${record.row.morningReturnQuantity} / ${record.row.dayReturnQuantity} / ${record.row.eveningReturnQuantity}`, target ? `${target.morningReturnQuantity} / ${target.dayReturnQuantity} / ${target.eveningReturnQuantity}` : '—'],
          [text('কমিশন','कमीशन','Commission'), `₹${record.row.commissionRupees}`, target ? formatPaise(target.commissionPaise) : '—'],
        ].map(([label,phone,saved])=><tr key={label} data-different={String(phone)!==String(saved)}><th>{label}</th><td>{phone}</td><td>{saved}</td></tr>)}
      </tbody></table>
      {!target && <p>{text('এই তারিখে সার্ভারে বিল নেই।','इस तारीख का सर्वर बिल नहीं है।','There is no server bill for this date.')}</p>}
      {snapshot.referencedSale && snapshot.referencedSale.occurredAt !== snapshot.occurredAt && <p>{text('ফোনে যুক্ত পুরোনো বিল','फोन से जुड़ा पुराना बिल','Previously linked phone bill')}: {snapshot.referencedSale.reference} · {snapshot.referencedSale.occurredAt}. {text('ওই দিনের বিল অপরিবর্তিত থাকবে।','उस दिन का बिल नहीं बदलेगा।','That day’s bill will remain unchanged.')}</p>}
      {(!target || target.status==='DRAFT') && <button type="button" disabled={busy || reading} onClick={()=>setKeep(true)}>{text('ফোনের তথ্য রাখুন','फोन के बदलाव रखें','Keep phone values')}</button>}
      {keep && <div className="lottery-recovery-confirm"><p>{text('তুলনায় দেখানো এই তারিখের বিলে ফোনের বিক্রি, ফেরত ও কমিশন বসবে। পেমেন্ট বদলাবে না। নিশ্চিত করবেন?','इस तारीख के बिल में फोन की बिक्री, रिटर्न और कमीशन रखेंगे। भुगतान नहीं बदलेगा। पुष्टि करें?','Apply the phone sale, returns and commission to this date’s bill? Payments will remain unchanged.')}</p>
        <button type="button" disabled={busy || reading} onClick={()=>void run('keep-local')}>{text('নিশ্চিত করে রাখুন','रखने की पुष्टि करें','Confirm phone values')}</button>
        <button type="button" disabled={busy || reading} onClick={()=>setKeep(false)}>{text('বাতিল','रद्द करें','Cancel')}</button>
      </div>}
    </div>}
    <div className="lottery-recovery-buttons">
      <button type="button" disabled={busy || reading} onClick={() => void run('retry')}>{text('আবার সেভ করুন', 'फिर सेव करें', 'Retry save')}</button>
      <button type="button" disabled={busy || reading} onClick={() => setConfirm(true)}>{snapshot && target ? text('সার্ভারের তথ্য রাখুন','सर्वर की एंट्री रखें','Keep server values') : text('অপেক্ষমান পরিবর্তন বাদ দিন', 'स्थानीय बदलाव हटाएँ', 'Discard pending changes')}</button>
    </div>
    {confirm && <div className="lottery-recovery-confirm">
      <p>{text('শুধু এই অপেক্ষমান পরিবর্তন বাদ যাবে। recovery copy থাকবে। সার্ভারের বিল বা পেমেন্ট মুছবে না।', 'केवल यह स्थानीय बदलाव हटेगा। रिकवरी कॉपी रहेगी। सर्वर का बिल या भुगतान नहीं मिटेगा।', 'Only these pending changes will be discarded. A recovery copy is kept. Server bills and payments will remain.')}</p>
      <button type="button" disabled={busy || reading} onClick={() => void run('discard')}>{text('নিশ্চিত করে বাদ দিন', 'हटाने की पुष्टि करें', 'Confirm discard')}</button>
      <button type="button" disabled={busy || reading} onClick={() => setConfirm(false)}>{text('বাতিল', 'रद्द करें', 'Cancel')}</button>
    </div>}
    {busy && <output>{text('যাচাই হচ্ছে…', 'जाँच हो रही है…', 'Checking…')}</output>}
    {server && <div className="lottery-recovery-confirm"><strong>{text('সার্ভারে সংরক্ষিত', 'सर्वर पर सहेजा', 'Saved on server')}</strong><p>{text('পাঠানো', 'भेजे', 'Dispatch')}: {server.dispatch}</p><p>{text('ফেরত', 'वापसी', 'Returns')}: {server.returns}</p><p>{text('কমিশন', 'कमीशन', 'Commission')}: {formatPaise(server.commissionPaise)}</p></div>}
    {error && <output>{error}</output>}
  </div>;
}
