import { lotteryLabel } from "./copy";
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
  const [bankChannel, setBankChannel] = useState("");
  const [method, setMethod] = useState<LotteryMoneyMethod | null>(null);
  const language = useLotteryLanguage();
  const l = (bn: string, hi: string, en: string) =>
    inLanguage(language, bn, hi, en);
  const bankWorkspace = {
    ...workspace,
    organization: {
      ...workspace.organization,
      paymentOptions: {
        upi: false,
        cheque: false,
        bankChannels:
          workspace.organization?.paymentOptions?.bankChannels ?? [],
      },
    },
  };
  function back() {
    if (bankChannel) {
      setBankChannel("");
      return;
    }
    if (method === "upiPaise" || method === "chequePaise") {
      setMethod("bankPaise");
      return;
    }
    if (method) {
      setMethod(null);
      return;
    }
    onClose();
  }
  const statementWorkspace=method === "bankPaise" && !bankChannel ? bankWorkspace : workspace;
  const statement = method
    ? lotteryMoneyStatement(
        statementWorkspace,
        method,
        from,
        to,
        bankChannel || undefined,
      )
    : null;
  return (
    <section className="lottery-cash-details" aria-label="Money details">
      <div className="cash-detail-heading">
        <button type="button" onClick={back}>
          ← {l("ফিরুন", "वापस", "Back")}
        </button>
        <h2>
          {bankChannel ||
            (method
              ? lotteryLabel(
                  language,
                  lotteryMoneyMethods.find(([key]) => key === method)?.[1] ??
                    "Cash",
                )
              : l("ক্যাশ", "रकम", "Cash"))}
        </h2>
      </div>
      <p className="cash-period">
        {from} — {to}
      </p>
      {!statement ? (
        <div className="cash-method-list">
          {lotteryMoneyMethods.map(([key, label]) => {
            if (key === "upiPaise" || key === "chequePaise") return null;
            const data = lotteryMoneyStatement(
              key === "bankPaise" ? bankWorkspace : workspace,
              key,
              from,
              to,
            );
            return (
              <button
                type="button"
                key={key}
                onClick={() => {
                  setBankChannel("");
                  setMethod(key);
                }}
              >
                <span>
                  {lotteryLabel(language, label)}
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
          {method === "bankPaise" && !bankChannel && (
            <div className="cash-method-list" aria-label="Bank channels">
              {lotteryMoneyMethods
                .filter(
                  ([key]) =>
                    (key === "upiPaise" &&
                      workspace.organization?.paymentOptions?.upi) ||
                    (key === "chequePaise" &&
                      workspace.organization?.paymentOptions?.cheque),
                )
                .map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMethod(key)}
                  >
                    <span>{label}</span>
                    <strong>
                      {formatPaise(
                        lotteryMoneyStatement(workspace, key, from, to).balance,
                      )}
                    </strong>
                  </button>
                ))}
              {workspace.organization?.paymentOptions?.bankChannels.map(
                (name) => (
                  <button
                    type="button"
                    key={name}
                    onClick={() => {
                      setMethod("bankPaise");
                      setBankChannel(name);
                    }}
                  >
                    <span>{name}</span>
                    <strong>
                      {formatPaise(
                        lotteryMoneyStatement(
                          workspace,
                          "bankPaise",
                          from,
                          to,
                          name,
                        ).balance,
                      )}
                    </strong>
                  </button>
                ),
              )}
            </div>
          )}
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
                    <th key={lotteryLabel(language, label)}>
                      {lotteryLabel(language, label)}
                    </th>
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
