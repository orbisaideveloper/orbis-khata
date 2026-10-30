import { useState } from "react";
import type { LotteryWorkspace } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { formatPaise } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney";
import {
  lotteryMoneyMethods,
  lotteryMoneyStatement,
  type LotteryMoneyMethod,
} from "./money-statement";
import { useLotteryLanguage } from "./language";
import { inLanguage } from "../localize";
export function LotteryCashDetails({
  workspace,
  from,
  to,
  onClose,
}: Readonly<{
  workspace: LotteryWorkspace;
  from: string;
  to: string;
  onClose: () => void;
}>) {
  const [method, setMethod] = useState<LotteryMoneyMethod | null>(null);
  const language = useLotteryLanguage();
  const l = (bn: string, hi: string, en: string) =>
    inLanguage(language, bn, hi, en);
  const statement = method
    ? lotteryMoneyStatement(workspace, method, from, to)
    : null;
  return (
    <section className="lottery-cash-details" aria-label="Money details">
      <div className="cash-detail-heading">
        <button
          type="button"
          onClick={() => (method ? setMethod(null) : onClose())}
        >
          ← {l("ফিরুন", "वापस", "Back")}
        </button>
        <h2>
          {method
            ? lotteryMoneyMethods.find(([key]) => key === method)?.[1]
            : l("ক্যাশ", "रकम", "Cash")}
        </h2>
      </div>
      <p className="cash-period">
        {from} — {to}
      </p>
      {!statement ? (
        <div className="cash-method-list">
          {lotteryMoneyMethods.map(([key, label]) => {
            const data = lotteryMoneyStatement(workspace, key, from, to);
            if (
              (key === "upiPaise" || key === "chequePaise") &&
              data.balance === 0n &&
              data.rows.length === 0
            )
              return null;
            return (
              <button type="button" key={key} onClick={() => setMethod(key)}>
                <span>
                  {label}
                  {key === "pwtPaise" && (
                    <small>
                      {l(
                        "নগদ নয় · পুরস্কারের সমন্বয়",
                        "गैर-नकद समायोजन",
                        "Non-cash prize adjustment",
                      )}
                    </small>
                  )}
                </span>
                <strong
                  className={data.balance < 0n ? "money-out" : "money-in"}
                >
                  {formatPaise(data.balance)}
                </strong>
                <span aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="cash-summary">
            <span>
              {l("শুরুর ব্যালেন্স", "शुरुआती शेष", "Opening")}:{" "}
              {formatPaise(statement.opening)}
            </span>
            <span>
              {l("শেষ ব্যালেন্স", "अंतिम शेष", "Closing")}:{" "}
              {formatPaise(statement.balance)}
            </span>
          </div>
          <div className="cash-table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    l("তারিখ", "तारीख", "Date"),
                    l("নাম / রেফারেন্স", "नाम / संदर्भ", "Name / reference"),
                    l("আদায়", "प्राप्त", "Received"),
                    l("দেওয়া", "दिया", "Paid"),
                    l("ব্যালেন্স", "शेष", "Balance"),
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>
                      <strong>{row.name}</strong>
                      <small>{row.reference}</small>
                    </td>
                    <td className="money-in">
                      {row.amount > 0n ? formatPaise(row.amount) : "—"}
                    </td>
                    <td className="money-out">
                      {row.amount < 0n ? formatPaise(-row.amount) : "—"}
                    </td>
                    <td className={row.balance < 0n ? "money-out" : "money-in"}>
                      {formatPaise(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>{l("মোট", "कुल", "Total")}</th>
                  <td>{formatPaise(statement.incoming)}</td>
                  <td>{formatPaise(statement.outgoing)}</td>
                  <td>{formatPaise(statement.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {statement.rows.length === 0 && (
            <p>
              {l(
                "এই সময়ে কোনো লেনদেন নেই।",
                "इस अवधि में कोई लेनदेन नहीं।",
                "No transactions in this period.",
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
