import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
vi.mock('./App',()=>({default:()=> <div>Production account</div>}))
vi.mock('./demo/DemoApp',()=>({default:()=> <div>Isolated demo</div>}))
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.resetModules()})
it.each([[false,'true','Production account'],[true,'true','Isolated demo'],[true,'false','Production account']]as const)('keeps the demo behind both development flags: %s %s',async(dev,flag,label)=>{vi.stubEnv('DEV',dev);vi.stubEnv('VITE_KHATA_DEMO',flag);const{default:EntryApp}=await import('./EntryApp');render(<EntryApp/>);expect(await screen.findByText(label)).toBeInTheDocument()})
