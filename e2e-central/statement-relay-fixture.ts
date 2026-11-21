import type { Route } from '@playwright/test'
/** Unrelated browser scenarios have no shared accounts. Validate, then return an empty inbox. */
export async function emptyStatementRelay(route: Pick<Route,'request'|'fulfill'>): Promise<boolean> {
  const request=route.request()
  if(new URL(request.url()).pathname!=='/khata/customer-relay') return false
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,authorization','cache-control':'no-store'}
  if(request.method()==='OPTIONS') {await route.fulfill({status:204,headers});return true}
  const body=request.postDataJSON()
  if(request.method()!=='POST' || request.headers().authorization!=='Bearer test.access' || body.version!=='orbis.khata.data.v1' || body.operation!=='customer-relay' || JSON.stringify(body.input)!==JSON.stringify({action:'list'})) throw new Error('UNEXPECTED_STATEMENT_RELAY_REQUEST')
  await route.fulfill({status:200,headers,json:{data:[]}})
  return true
}
