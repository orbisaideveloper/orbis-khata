import type { ReactNode } from "react";
import { LotteryLanguage } from "./language";
import { ModulePicker } from "../ModulePicker";
import { LotteryAccountingWorkspace } from "../../vendor/foundation-lottery/src/admin/dashboard/sections/LotteryAccountingWorkspace";
import type { Language } from "../i18n";
import { inLanguage } from "../localize";
import "./lottery.css";
export default function LotteryPage({
  owner,
  language,
  onSelect,
  controls,
}: Readonly<{
  owner: string;
  language: Language;
  onSelect: (module: "khata" | "lottery") => void;
  controls?: ReactNode;
}>) {
  return (
    <section
      className="lottery-module"
      aria-label={inLanguage(
        language,
        "লটারি হিসাব",
        "लॉटरी हिसाब",
        "Lottery accounts",
      )}
    >
      <header className="module-heading">
        <div className="lottery-header-controls">{controls}</div>
        <h1>ORBIS · {inLanguage(language, "লটারি", "लॉटरी", "Lottery")}</h1>
        <ModulePicker
          language={language}
          active="lottery"
          onSelect={onSelect}
        />
      </header>
      <LotteryLanguage.Provider value={language}>
        <LotteryAccountingWorkspace
          localScope={{ ownerKind: "PUBLIC_USER", ownerId: owner }}
        />
      </LotteryLanguage.Provider>
    </section>
  );
}
