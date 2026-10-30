import { createContext, useContext } from "react";
import type { Language } from "../i18n";
export const LotteryLanguage = createContext<Language>("en");
export const useLotteryLanguage = () => useContext(LotteryLanguage);
