import type { Language } from "../i18n";
import { inLanguage } from "../localize";
import { displayQuantity, quantity } from "../inventory/model";
export function BillStock({
  lines,
  stocks,
  warehouse,
  items,
  kind,
  language,
}: Readonly<{
  lines: { item: string; quantity: string }[];
  stocks: { item: string; warehouse: string; closing: string }[] | null;
  warehouse: string;
  items: { id: string; name: string; unit: string }[];
  kind: string;
  language: Language;
}>) {
  if (kind === "expense") return null;
  return (
    <div className="bill-stock">
      <small>
        {inLanguage(
          language,
          "এই বিলের পরে স্টক",
          "इस बिल के बाद स्टॉक",
          "Stock after this bill",
        )}
      </small>
      {[...new Set(lines.map((l) => l.item).filter(Boolean))].map((id) => {
        const item = items.find((i) => i.id === id);
        let value: bigint | null = null;
        try {
          if (stocks !== null) {
            const used = lines
              .filter((l) => l.item === id)
              .reduce((sum, l) => sum + BigInt(quantity(l.quantity)), 0n);
            value =
              BigInt(
                stocks.find((s) => s.item === id && s.warehouse === warehouse)
                  ?.closing ?? "0",
              ) + (kind === "sale" ? -used : used);
          }
        } catch {
          /* Incomplete draft has no projected quantity. */
        }
        return (
          <span key={id}>
            {item?.name}{" "}
            <strong className={value !== null && value < 0n ? "negative" : ""}>
              {value === null ? "—" : displayQuantity(String(value))}{" "}
              {item?.unit}
            </strong>
          </span>
        );
      })}
    </div>
  );
}
