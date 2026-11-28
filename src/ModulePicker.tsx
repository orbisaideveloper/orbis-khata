import {shareCopy} from "./customer-view/copy";
import { inLanguage } from "./localize";
import { translations, type Language } from "./i18n";
import { dailyLedgerEnabled } from "./daily-ledger/availability";
export type ModuleTarget = "khata" | "lottery" | "customer" | "results" | "daily";
export function ModulePicker({
  language,
  active,
  onSelect,
}: Readonly<{
  language: Language;
  active: ModuleTarget;
  onSelect: (module: ModuleTarget) => void;
}>) {
  const t = translations[language];
  return (
    <details className="module-picker">
      <summary>
        {inLanguage(language, "মডিউল", "मॉड्यूल", "Modules")}{" "}
        <span aria-hidden="true">▦</span>
      </summary>
      <nav
        aria-label={inLanguage(
          language,
          "মডিউল বাছুন",
          "मॉड्यूल चुनें",
          "Choose module",
        )}
      >
        {(["khata", "lottery", "customer", "results"] as const).map((module) => (
          <button
            key={module}
            type="button"
            aria-current={active === module ? "page" : undefined}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onSelect(module);
            }}
          >
            {({khata:t.khata,lottery:t.lot,customer:shareCopy(language,"title"),results:inLanguage(language,"লটারি রেজাল্ট","लॉटरी नतीजे","Lottery results")})[module]}
            <span aria-hidden="true">→</span>
          </button>
        ))}
        <button type="button" disabled={!dailyLedgerEnabled()} aria-current={active === "daily" ? "page" : undefined}
          onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); onSelect("daily"); }}>
          {inLanguage(language,"দৈনিক হিসাব","दैनिक हिसाब","Daily accounts")}
          {!dailyLedgerEnabled() && <small>{t.later}</small>}
        </button>
        <button type="button" disabled>
          {t.farm}
          <small>{t.later}</small>
        </button>
      </nav>
    </details>
  );
}
