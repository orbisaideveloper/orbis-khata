import { useState } from "react";
import type { LotteryWorkspace } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes";
import { formatPaise } from "../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney";
import {
  lotteryCommissionDays,
  lotteryCommissionParties,
  type CommissionSide,
} from "./commission-statement";
import { useLotteryLanguage } from "./language";
import { lotteryLabel } from "./copy";
export function CommissionStatement({
  workspace,
  from,
  to,
  onClose,
  onOpen,
}: Readonly<{
  workspace: LotteryWorkspace;
  from: string;
  to: string;
  onClose: () => void;
  onOpen: (side: CommissionSide, partyId: string, day: string) => void;
}>) {
  const [detail, setDetail] = useState<{
    day: string;
    side: CommissionSide;
  } | null>(null);
  const [page, setPage] = useState(0);
  const language = useLotteryLanguage();
  const l = (label: string) => lotteryLabel(language, label);
  const statement = lotteryCommissionDays(workspace, from, to);
  const detailTitle =
    detail?.side === "seller" ? "Seller commission" : "Stockist commission";
  const rows = detail
    ? lotteryCommissionParties(workspace, detail.side, detail.day)
    : [];
  return (
    <section
      className="lottery-cash-details commission-statement"
      aria-label="Commission statement"
    >
      <div className="cash-detail-heading">
        <button
          type="button"
          onClick={() => (detail ? setDetail(null) : onClose())}
        >
          ← {l("Back")}
        </button>
        <h2>{detail ? l(detailTitle) : l("Commission statement")}</h2>
      </div>
      <p className="cash-period">{detail ? detail.day : from + " — " + to}</p>
      <div className="cash-table-scroll">
        <table>
          {detail ? (
            <>
              <thead>
                <tr>
                  <th>{l("Name")}</th>
                  <th>{l("Commission")}</th>
                  <th>{l("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className="commission-link"
                        disabled={!workspace.parties.some(p=>p.id===row.id)}
                        onClick={() => onOpen(detail.side, row.id, detail.day)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td>{formatPaise(row.amount)}</td>
                    <td className={row.entered ? "money-in" : "money-out"}>
                      {l(row.entered ? "Entered" : "Not entered")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>{l("Total")}</th>
                  <td>
                    {formatPaise(
                      rows.reduce((sum, row) => sum + row.amount, 0n),
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </>
          ) : (
            <>
              <thead>
                <tr>
                  {[
                    "Date",
                    "Stockist commission",
                    "Seller commission",
                    "Difference",
                  ].map((label) => (
                    <th key={label}>{l(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement.rows.slice(page * 50, page * 50 + 50).map((row) => (
                  <tr key={row.day}>
                    <td>
                      <button
                        type="button"
                        className="commission-link"
                        onClick={() =>
                          setDetail({ day: row.day, side: "seller" })
                        }
                      >
                        {row.day}
                      </button>
                    </td>
                    {(["stockist", "seller"] as const).map((side) => (
                      <td key={side}>
                        <button
                          type="button"
                          className="commission-link"
                          aria-label={`${row.day} ${side} commission`}
                          onClick={() => setDetail({ day: row.day, side })}
                        >
                          {formatPaise(row[side])}
                        </button>
                      </td>
                    ))}
                    <td
                      className={
                        row.difference === 0n ? "money-in" : "money-out"
                      }
                    >
                      {formatPaise(row.difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>{l("Total")}</th>
                  <td>{formatPaise(statement.stockist)}</td>
                  <td>{formatPaise(statement.seller)}</td>
                  <td>{formatPaise(statement.difference)}</td>
                </tr>
              </tfoot>
            </>
          )}
        </table>
      </div>
      {!detail && statement.rows.length > 50 && (
        <div className="commission-pagination">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            {l("Previous")}
          </button>
          <span>
            {page + 1} / {Math.ceil(statement.rows.length / 50)}
          </span>
          <button
            type="button"
            disabled={(page + 1) * 50 >= statement.rows.length}
            onClick={() => setPage(page + 1)}
          >
            {l("Next")}
          </button>
        </div>
      )}
    </section>
  );
}
