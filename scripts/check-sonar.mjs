const token = process.env.SONAR_TOKEN
const project = process.env.SONAR_PROJECT_KEY
const branch = process.env.GITHUB_REF_NAME
const host = (process.env.SONAR_HOST_URL || 'https://sonarcloud.io').replace(/\/$/, '')
if (!token || !project || branch !== 'main') throw Error('Sonar credentials/project/main branch missing')
const auth = `Bearer ${token}`
async function get(path, params) {
  const url = new URL(host + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const response = await fetch(url, { headers: { Authorization: auth } })
  if (!response.ok) throw Error(`Sonar API ${path}: HTTP ${response.status}`)
  return response.json()
}
const common = { componentKeys: project }
const issues = await get('/api/issues/search', { ...common, resolved: 'false', ps: '1' })
if (!Number.isInteger(issues.total)) throw Error('Sonar issue count missing')
console.log(`Open Sonar issues: ${issues.total}`)
if (issues.total !== 0) throw Error('Open issues must be zero')
const hotspots = await get('/api/hotspots/search', { project, status: 'TO_REVIEW', ps: '1' })
if (!Number.isInteger(hotspots.paging?.total)) throw Error('Security hotspot count missing')
console.log(`Unreviewed security hotspots: ${hotspots.paging.total}`)
if (hotspots.paging.total !== 0) throw Error('Unreviewed security hotspots must be zero')
const data = await get('/api/measures/component', {
  component: project, metricKeys: 'coverage,duplicated_lines_density',
})
const measures = Object.fromEntries((data.component?.measures || []).map(m => [m.metric, Number(m.value)]))
for (const metric of ['coverage', 'duplicated_lines_density']) {
  if (!Number.isFinite(measures[metric])) throw Error(`${metric} is missing: NOT VERIFIED`)
}
console.log(`Sonar coverage: ${measures.coverage}%`)
console.log(`Sonar duplication: ${measures.duplicated_lines_density}%`)
if (measures.coverage < 90 || measures.duplicated_lines_density !== 0) {
  throw Error('Overall Sonar coverage/duplication policy failed')
}
console.log('STRICT SONAR CHECK: PASS')
