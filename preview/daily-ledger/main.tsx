import '@fontsource/noto-sans-bengali/bengali-400.css'
import '@fontsource/noto-sans-bengali/bengali-700.css'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import Preview from './Preview'
import './preview.css'

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./daily-ledger-preview-sw.js', { scope: './' }).catch(() => {
    console.warn('Daily Ledger preview offline assets could not be installed.')
  })
}
