import { inLanguage } from "./localize";
import { translations, type Language } from "./i18n";
export function ModulePicker({
  language,
  active,
  onSelect,
}: Readonly<{
  language: Language;
  active: "khata" | "lottery";
  onSelect: (module: "khata" | "lottery") => void;
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
        {(["khata", "lottery"] as const).map((module) => (
          <button
            key={module}
            type="button"
            aria-current={active === module ? "page" : undefined}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onSelect(module);
            }}
          >
            {module === "khata" ? t.khata : t.lot}
            <span aria-hidden="true">→</span>
          </button>
        ))}
        <button type="button" disabled>
          {t.farm}
          <small>{t.later}</small>
        </button>
      </nav>
    </details>
  );
}
