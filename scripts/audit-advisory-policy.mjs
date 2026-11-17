const ADVISORY = 'GHSA-fc5q-39xc-vjpf';
const PACKAGES = new Set(['picomatch','fdir','knip','tinyglobby','vite','@vitejs/plugin-react','vitest','@vitest/coverage-v8']);
export function evaluateAudit(report, now) {
  if (report?.error || !report?.metadata?.vulnerabilities || !report?.vulnerabilities)
    return {ok:false, message:'Missing or invalid audit data'};
  const entries=Object.entries(report.vulnerabilities);
  if (!entries.length) {
    const counts=report.metadata.vulnerabilities;
    return Number(counts.total)===0 ? {ok:true,exception:false,message:'No vulnerabilities'} : {ok:false,message:'Inconsistent audit totals'};
  }
  if (now.getTime()>=Date.parse('2026-11-25T00:00:00Z'))
    return {ok:false,message:'Unpatched dev dependency exception expired'};
  if (!entries.every(([name,info])=>PACKAGES.has(name) && typeof info.isDirect==='boolean' && Array.isArray(info.via)))
    return {ok:false,message:'Unexpected vulnerable dependency'};
  const roots=entries.filter(([,info])=>info.via.some(v=>typeof v==='object'));
  if (roots.length!==1 || roots[0][0]!=='picomatch' ||
      !roots[0][1].via.every(v=>typeof v==='object' && String(v.url).includes(ADVISORY)))
    return {ok:false,message:'Unknown security advisory; fail closed'};
  for (const [name,info] of entries)
    if (name!=='picomatch' && !info.via.every(v=>typeof v==='string'&&PACKAGES.has(v)))
      return {ok:false,message:'Unexpected vulnerability chain: '+name};
  return {ok:true,exception:true,message:'Unpatched dev-only picomatch advisory: '+entries.map(([n])=>n).join(', ')};
}
