import {BankFolder} from "./BankFolder";
import { accountingBusinessDate } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate";
import { useRef, useState } from "react";
import type {
  LotteryParty,
  LotteryWorkspace,
} from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import {
  formatPaise,
  rupeesToPaise,
} from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney";
import { sellerDayBalance } from "./seller-balance";
import { useLotteryLanguage } from "./language";
import { inLanguage } from "../localize";
const baseMethods = [
  ["cashPaise", "Cash"],
  ["pwtPaise", "PWD"],
  ["bankPaise", "Bank"],
] as const;
export function SellerReceipt({
  workspace,
  party,
  day,
  bill,
  disabled,
  onSave,
}: Readonly<{
  workspace: LotteryWorkspace;
  party: LotteryParty;
  day: string;
  bill: bigint;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}>) {
  const methods=[...baseMethods,...(workspace.organization.paymentOptions?.upi?[["upiPaise","UPI"] as const]:[]),...(workspace.organization.paymentOptions?.cheque?[["chequePaise","Cheque"] as const]:[])];
  const [bankChannel,setBankChannel]=useState("");
  const language = useLotteryLanguage();
  const l = (bn: string, en: string, hi: string) =>
    inLanguage(language, bn, hi, en);
  const [amounts, setAmounts] = useState({
    cashPaise: "",
    pwtPaise: "",
    bankPaise: "",
    upiPaise: "",
    chequePaise: "",
  });
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const parsed = methods.map(([key]) => rupeesToPaise(amounts[key] || "0"));
  const valid = parsed.every((v) => v !== null);
  const entered = parsed.reduce<bigint>((sum, v) => sum + BigInt(v ?? 0), 0n);
  const totals = sellerDayBalance(workspace, party, day, bill);
  async function receive() {
    if (locked.current) {
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave({
        organizationId: workspace.organization.id,
        partyId: party.id,
        occurredAt: day,
        direction: "RECEIPT",
        bankChannel,
        totalAmountPaise: entered.toString(),
        methodSplit: Object.fromEntries(
          methods.map(([key], i) => [key, parsed[i]]),
        ),
      });
      setAmounts({ cashPaise: "", pwtPaise: "", bankPaise: "",upiPaise:"",chequePaise:"" });
    } catch {
      setError(
        l(
          "আদায় সেভ হয়নি। আবার চেষ্টা করুন।",
          "Receipt not confirmed. Retry to save safely.",
          "प्राप्ति की पुष्टि नहीं हुई। फिर कोशिश करें।",
        ),
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="seller-receipt" aria-label={`${party.name} receipt`}>
      <dl>
        <div>
          <dt>{l("আজকের বিল", "Today’s bill", "आज का बिल")}</dt>
          <dd>{formatPaise(bill)}</dd>
        </div>
        {totals.last && (
          <div>
            <dt>
              {l("শেষ আদায়", "Last receipt", "पिछली प्राप्ति")} ·{" "}
              {accountingBusinessDate(totals.last.occurredAt)}
            </dt>
            <dd>{formatPaise(totals.last.totalAmountPaise)}</dd>
          </div>
        )}
        <div>
          <dt>{l("আগের ব্যালেন্স", "Old balance", "पुराना शेष")}</dt>
          <dd>{formatPaise(totals.old)}</dd>
        </div>
        <div>
          <dt>{l("মোট পাওনা", "Total due", "कुल लेना है")}</dt>
          <dd>{formatPaise(totals.total)}</dd>
        </div>
        <div>
          <dt>{l("আজ আদায় হয়েছে", "Received today", "आज प्राप्त")}</dt>
          <dd>{formatPaise(totals.received)}</dd>
        </div>
      </dl>
      <fieldset disabled={disabled || busy}>
        <legend>{l("এখন আদায়", "Receive now", "अभी प्राप्त करें")}</legend>
        <div className="receipt-methods">
          {methods.map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                aria-label={`Receipt ${label}`}
                inputMode="decimal"
                placeholder="0.00"
                value={amounts[key]}
                onChange={(e) =>
                  setAmounts({ ...amounts, [key]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <BankFolder organization={workspace.organization} value={bankChannel} onChange={setBankChannel}/>
        <button
          type="button"
          disabled={!valid || entered <= 0n}
          onClick={() => void receive()}
        >
          {busy
            ? l("সেভ হচ্ছে…", "Saving…", "सहेज रहे हैं…")
            : l("আদায় সেভ করুন", "Save receipt", "प्राप्ति सहेजें")}
        </button>
      </fieldset>
      <div className="receipt-balance">
        <span>{l("ক্যারি ফরওয়ার্ড", "Carry forward", "आगे का शेष")}</span>
        <strong>{formatPaise(totals.balance - entered)}</strong>
      </div>
      {error && <output role="alert">{error}</output>}
    </section>
  );
}
