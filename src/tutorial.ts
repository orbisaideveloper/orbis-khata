import type {ReactNode} from "react";
import { createContext, useContext } from 'react'
export const TutorialContext = createContext(false)
export function useTutorial() { return useContext(TutorialContext) }
export function readTutorial() {
  try { return localStorage.getItem('orbis-khata-tutorial-v1') === 'on' } catch { return false }
}
export function saveTutorial(enabled: boolean) {
  try { localStorage.setItem('orbis-khata-tutorial-v1', enabled ? 'on' : 'off') } catch { /* Runtime preference still works. */ }
}

export function TutorialNote({children}:Readonly<{children:ReactNode}>){return useTutorial()?children:null;}
