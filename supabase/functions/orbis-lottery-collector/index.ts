import { createDrawRpc } from '../../../src/lottery-results/draw-store.ts'
import { createDrawService } from '../../../src/lottery-results/draw-service.ts'
import { createDrawWorker } from '../../../src/lottery-results/draw-worker.ts'
const env = (name: string) => Deno.env.get(name) ?? ''
const rpc = createDrawRpc(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
Deno.serve(createDrawWorker(rpc, createDrawService({ rpc, token: () => env('SAMBAD_API_TOKEN') })))
