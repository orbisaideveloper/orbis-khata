import { lazy, Suspense } from 'react'
const Root=lazy(()=>import.meta.env.DEV&&import.meta.env.VITE_KHATA_DEMO==='true'?import('./demo/DemoApp'):import('./App'))
export default function EntryApp(){return <Suspense fallback={<p>ORBIS…</p>}><Root/></Suspense>}
