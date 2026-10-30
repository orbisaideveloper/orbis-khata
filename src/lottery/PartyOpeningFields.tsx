import { useState } from "react";
import type { LotteryParty } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { inLanguage } from "../localize";
import { useLotteryLanguage } from "./language";
import { rupeesToPaise } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney";
export type OpeningForm = { amount: string; advance: boolean; date: string };
export function partyOpeningForm(
  party: LotteryParty | undefined,
  today: string,
): OpeningForm {
  const amount = BigInt(party?.openingBalancePaise ?? "0");
  const absolute = amount < 0n ? -amount : amount;
  return {
    amount: `${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`,
    advance: amount < 0n,
    date: party?.openingBalanceDate ?? today,
  };
}
export function openingPayload(value: OpeningForm) {
  const paise = rupeesToPaise(value.amount);
  return paise === null
    ? null
    : {
        openingBalancePaise: (value.advance
          ? -BigInt(paise)
          : BigInt(paise)
        ).toString(),
        openingBalanceDate: value.date,
      };
}
export function PartyOpeningFields({
  value,
  onChange,
  stockist,
}: Readonly<{
  value: OpeningForm;
  onChange: (value: OpeningForm) => void;
  stockist: boolean;
}>) {
  const language = useLotteryLanguage();
  const l = (bn: string, en: string, hi: string) =>
    inLanguage(language, bn, hi, en);
  return (
    <fieldset className="lottery-opening">
      <legend>{l("আগের ব্যালেন্স", "Opening balance", "पुराना शेष")}</legend>
      <label>
        {l("ধরন", "Type", "प्रकार")}
        <select
          aria-label="Opening balance direction"
          value={value.advance ? "advance" : "due"}
          onChange={(e) =>
            onChange({ ...value, advance: e.target.value === "advance" })
          }
        >
          <option value="due">
            {stockist
              ? l(
                  "স্টকিস্টকে দেবেন",
                  "You owe the stockist",
                  "स्टॉकिस्ट को देना है",
                )
              : l("পার্টির কাছে পাবেন", "Party owes you", "पार्टी से लेना है")}
          </option>
          <option value="advance">
            {stockist
              ? l("আগে দেওয়া অগ্রিম", "Advance paid", "पहले दिया अग्रिम")
              : l("আগে পাওয়া অগ্রিম", "Advance received", "पहले मिला अग्रिम")}
          </option>
        </select>
      </label>
      <div>
        <label>
          {l("টাকা", "Amount", "राशि")}
          <input
            aria-label="Opening balance amount"
            required
            pattern="[0-9]+([.][0-9]{1,2})?"
            inputMode="decimal"
            value={value.amount}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
          />
        </label>
        <label>
          {l("তারিখ", "Date", "तारीख")}
          <input
            aria-label="Opening balance date"
            type="date"
            required
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </label>
      </div>
    </fieldset>
  );
}
type Contacts = Navigator & {
  contacts?: {
    select: (
      fields: string[],
      options: { multiple: boolean },
    ) => Promise<{ tel?: string[] }[]>;
  };
};
export function LotteryContact({
  onNumber,
}: Readonly<{ onNumber: (number: string) => void }>) {
  const [error, setError] = useState(false);
  const language = useLotteryLanguage();
  const contacts = (navigator as Contacts).contacts;
  async function choose() {
    try {
      const picked = await contacts?.select(["tel"], { multiple: false });
      const phone = picked?.[0]?.tel?.[0];
      if (phone) {
        onNumber(phone.slice(0, 30));
        setError(false);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setError(true);
    }
  }
  return (
    <div className="lottery-contact">
      {contacts && (
        <button type="button" onClick={() => void choose()}>
          {inLanguage(
            language,
            "ফোনবুক থেকে নিন",
            "संपर्क से चुनें",
            "Choose from contacts",
          )}
        </button>
      )}
      {error && (
        <output role="alert">
          {inLanguage(
            language,
            "নম্বর নেওয়া যায়নি। নিজে লিখুন।",
            "नंबर नहीं मिला। खुद लिखें।",
            "Could not read the number. Type it instead.",
          )}
        </output>
      )}
    </div>
  );
}
