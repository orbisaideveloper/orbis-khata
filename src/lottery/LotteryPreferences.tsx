import { percentToBasisPoints } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney";
import { useRef, useState } from "react";
import type { LotteryWorkspace } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { lotteryFetch } from "./transport";
import { paymentOptions, tdsRateOn } from "./organization-rules";
import { accountingToday } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate";
import { useLotteryLanguage } from "./language";
import { inLanguage } from "../localize";
import { useTutorial } from "../tutorial";
export function LotteryPreferences({
  workspace,
  section,
  onSaved,
  onClose,
}: Readonly<{
  workspace: LotteryWorkspace;
  section: "tds" | "payments";
  onSaved: () => Promise<unknown>;
  onClose: () => void;
}>) {
  const language = useLotteryLanguage(),
    tutorial = useTutorial();
  const l = (bn: string, en: string, hi: string) =>
    inLanguage(language, bn, hi, en);
  const lock = useRef(false);
  const [day, setDay] = useState(accountingToday()),
    [rate, setRate] = useState(
      String(tdsRateOn(workspace.organization, accountingToday()) / 100),
    );
  const [options, setOptions] = useState(() =>
    paymentOptions(workspace.organization.paymentOptions),
  );
  const [names, setNames] = useState(options.bankChannels.join("\n")),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const basisPoints = percentToBasisPoints(rate);
      if (section === "tds" && basisPoints === null)
        throw new Error("INVALID_TDS_RULE");
      const response = await lotteryFetch(
        "/lottery/settings/" +
          (section === "tds" ? "tds-rate" : "payment-options"),
        {
          method: "PATCH",
          body: JSON.stringify({
            organizationId: workspace.organization.id,
            ...(section === "tds"
              ? { tdsRateBps: Number(basisPoints), effectiveFrom: day }
              : {
                  paymentOptions: paymentOptions({
                    ...options,
                    bankChannels: names
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }),
                }),
          }),
        },
      );
      if (!response.ok) throw new Error("SAVE_FAILED");
      await onSaved();
      setMessage(l("সংরক্ষিত", "Saved", "सहेजा गया"));
    } catch {
      setMessage(
        l(
          "তারিখ, হার ও নাম যাচাই করুন। সেভ নিশ্চিত হয়নি।",
          "Check date, rate and names. Save not confirmed.",
          "तारीख, दर और नाम जाँचें। सहेजने की पुष्टि नहीं हुई।",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="lottery-preferences"
      aria-label={section === "tds" ? "TDS settings" : "Payment settings"}
    >
      <button type="button" disabled={busy} onClick={onClose}>
        ← {l("ফিরুন", "Back", "वापस")}
      </button>
      <h2>
        {section === "tds"
          ? "TDS"
          : l("পেমেন্টের মাধ্যম", "Payment methods", "भुगतान के तरीके")}
      </h2>
      <fieldset disabled={busy}>
        {section === "tds" ? (
          <>
            <label>
              <span>TDS (%)</span>
              <input
                aria-label="TDS percentage"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
            <label>
              {l("শুরুর তারিখ", "Effective from", "शुरू तारीख")}
              <input
                aria-label="TDS effective from"
                type="date"
                required
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            {tutorial && (
              <p>
                {l(
                  "এই তারিখ থেকে নতুন এন্ট্রিতে এই হার বসবে। পুরোনো সেভ করা হিসাব বদলাবে না।",
                  "New entries use the rate effective on their date. Saved historical entries stay unchanged.",
                  "नई एंट्री में उसकी तारीख की दर लगेगी। पुराने सहेजे हिसाब नहीं बदलेंगे।",
                )}
              </p>
            )}
            <table>
              <thead>
                <tr>
                  <th>{l("শুরুর তারিখ", "Effective from", "शुरू तारीख")}</th>
                  <th>TDS %</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{l("আগের হার", "Original rate", "पुरानी दर")}</td>
                  <td>
                    {(workspace.organization.tdsBaseRateBps ??
                      workspace.organization.tdsRateBps ??
                      200) / 100}
                  </td>
                </tr>
                {workspace.organization.tdsRules?.map((r) => (
                  <tr key={r.from}>
                    <td>{r.from}</td>
                    <td>{r.rateBps / 100}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <p>Cash · PWD · Bank</p>
            <label>
              <span>Online / UPI</span>
              <input
                type="checkbox"
                checked={options.upi}
                onChange={(e) =>
                  setOptions({ ...options, upi: e.target.checked })
                }
              />
            </label>
            <label>
              <span>Cheque</span>
              <input
                type="checkbox"
                checked={options.cheque}
                onChange={(e) =>
                  setOptions({ ...options, cheque: e.target.checked })
                }
              />
            </label>
            <label>
              {l(
                "ব্যাঙ্কের আলাদা নাম—প্রতি লাইনে একটি",
                "Bank folders — one name per line",
                "बैंक के अलग नाम — हर पंक्ति में एक",
              )}
              <textarea
                aria-label="Bank folders"
                placeholder={"GPay\nPhonePe"}
                value={names}
                onChange={(e) => setNames(e.target.value)}
              />
            </label>
            {tutorial && (
              <p>
                {l(
                  "আলাদা নামের টাকা ব্যাঙ্কের মোটের অংশ। পুরোনো UPI/চেকের হিসাব বন্ধ করলেও থাকবে।",
                  "Named folders are part of Bank totals. Turning an option off keeps its history.",
                  "अलग नाम बैंक के कुल का हिस्सा हैं। विकल्प बंद करने पर पुराना हिसाब रहेगा।",
                )}
              </p>
            )}
          </>
        )}
        <button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "…" : l("সেভ করুন", "Save", "सहेजें")}
        </button>
      </fieldset>
      {message && <output>{message}</output>}
    </section>
  );
}
