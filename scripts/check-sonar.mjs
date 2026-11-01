import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Collect all policy failures: an early issue must not hide the gate or metrics. */
export async function sonarReport(get, scope) {
  const failures = [], lines = [];
  async function collect(label, action) {
    try { await action(); }
    catch (error) {
      const message = `${label}: ${error.message}`;
      failures.push(message); lines.push(message);
    }
  }
  await collect('Quality gate', async () => {
    const task = await get('/api/ce/task', { id: scope.taskId });
    if (task.task?.status !== 'SUCCESS' || !task.task.analysisId) throw Error('Current analysis is not ready: NOT VERIFIED');
    const data = await get('/api/qualitygates/project_status', { analysisId: task.task.analysisId });
    const gate = data.projectStatus;
    if (!gate || !Array.isArray(gate.conditions)) throw Error('Gate conditions missing: NOT VERIFIED');
    lines.push(`Quality gate: ${gate.status}`);
    for (const condition of gate.conditions) {
      lines.push(`SONAR_CONDITION ${JSON.stringify({ metric: condition.metricKey, status: condition.status, comparator: condition.comparator, threshold: condition.errorThreshold ?? null, actual: condition.actualValue ?? null })}`);
    }
    if (gate.status !== 'OK') throw Error('Current quality gate failed');
  });
  await collect('Open issues', async () => {
    const issues = await get('/api/issues/search', { componentKeys: scope.project, branch: scope.branch, resolved: 'false', ps: '500' });
    if (!Number.isInteger(issues.total) || !Array.isArray(issues.issues)) throw Error('Issue count/details missing');
    lines.push(`Open Sonar issues: ${issues.total}`);
    for (const issue of issues.issues) lines.push('SONAR_ISSUE ' + JSON.stringify({ key: issue.key, rule: issue.rule, file: issue.component, line: issue.line, severity: issue.severity, message: issue.message }));
    if (issues.total > issues.issues.length) lines.push(`Showing first ${issues.issues.length} of ${issues.total} issues; see Sonar for the remaining pages.`);
    if (issues.total !== 0) throw Error('Open issues must be zero');
  });
  await collect('Security hotspots', async () => {
    const hotspots = await get('/api/hotspots/search', { projectKey: scope.project, branch: scope.branch, status: 'TO_REVIEW', ps: '100' });
    if (!Number.isInteger(hotspots.paging?.total)) throw Error('Hotspot count missing');
    lines.push(`Unreviewed security hotspots: ${hotspots.paging.total}`);
    for (const item of hotspots.hotspots ?? []) lines.push('SONAR_HOTSPOT ' + JSON.stringify({ key: item.key, file: item.component, line: item.line, message: item.message }));
    if (hotspots.paging.total !== 0) throw Error('Unreviewed security hotspots must be zero');
  });
  await collect('Overall metrics', async () => {
    const data = await get('/api/measures/component', { component: scope.project, branch: scope.branch, metricKeys: 'coverage,duplicated_lines_density' });
    const measures = Object.fromEntries((data.component?.measures ?? []).map(m => [m.metric, Number(m.value)]));
    for (const key of ['coverage', 'duplicated_lines_density']) if (!Number.isFinite(measures[key])) throw Error(`${key} missing: NOT VERIFIED`);
    lines.push(`Sonar coverage: ${measures.coverage}%`, `Sonar duplication: ${measures.duplicated_lines_density}%`);
    if (measures.coverage < 90 || measures.duplicated_lines_density !== 0) throw Error('Overall Sonar coverage/duplication policy failed');
  });
  lines.push(failures.length ? 'STRICT SONAR CHECK: FAIL' : 'STRICT SONAR CHECK: PASS');
  return { failures, lines };
}

async function main() {
  const token = process.env.SONAR_TOKEN, project = process.env.SONAR_PROJECT_KEY, branch = process.env.GITHUB_REF_NAME;
  if (!token || !project || branch !== 'main') throw Error('Sonar credentials/project/main branch missing');
  const host = new URL(process.env.SONAR_HOST_URL || 'https://sonarcloud.io');
  if (host.protocol !== 'https:' || host.username || host.password || host.pathname !== '/' || host.search || host.hash) throw Error('Invalid Sonar host');
  const taskFile = await readFile('.scannerwork/report-task.txt', 'utf8');
  const taskId = /^ceTaskId=(.+)$/mu.exec(taskFile)?.[1]?.trim();
  if (!taskId || !/^[A-Za-z0-9_-]+$/u.test(taskId)) throw Error('Current Sonar task missing: NOT VERIFIED');
  const get = async (path, params) => {
    const url = new URL(path, host);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`Sonar API ${path}: HTTP ${response.status}`);
    return response.json();
  };
  const report = await sonarReport(get, { project, branch, taskId });
  console.log(report.lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    // Sonar messages are untrusted text: escape HTML and prevent fence termination.
    const text = report.lines.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Sonar diagnostics\n<pre>${text}</pre>\n`);
  }
  if (report.failures.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
