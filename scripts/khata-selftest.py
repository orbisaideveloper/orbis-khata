#!/usr/bin/env python3
"""No-network/no-test-suite smoke checks for the Khata runner itself."""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.dont_write_bytecode = True
source = Path(__file__).with_name('khata.py')
spec = importlib.util.spec_from_file_location('khata_under_test', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert module.STAGES == ['ubuntu-preflight', 'knip', 'jscpd', 'playwright', 'npm-ls',
                         'npm-audit', 'lint', 'typecheck', 'build', 'sql', 'coverage']
for remote in ('https://github.com/orbisaideveloper/orbis-khata',
               'https://github.com/orbisaideveloper/orbis-khata.git',
               'git@github.com:orbisaideveloper/orbis-khata.git'):
    with patch.object(module, 'git', side_effect=['main', 'a'*40, remote]), patch.object(module, 'cmd', return_value=SimpleNamespace(returncode=0)):
        assert module.baseline() == ('main', 'a'*40, remote)
for remote in ('https://github.com/other/orbis-khata',
               'https://github.com/orbisaideveloper/orbis-khata.evil'):
    with patch.object(module, 'git', side_effect=['main', 'a'*40, remote]):
        try:
            module.baseline()
        except RuntimeError:
            pass
        else:
            raise AssertionError('Wrong repository accepted')
with tempfile.TemporaryDirectory() as td:
    work = Path(td)
    (work / 'src').mkdir()
    candidate = work / 'src/App.tsx'
    candidate.write_text('const a = 1\n', encoding='utf-8')
    old_root = module.ROOT
    old_cache = module.CACHE
    old_downloads = module.downloads
    try:
        module.ROOT = work
        module.CACHE = work / 'cache'
        module.downloads = lambda: work / 'downloads'
        (work / 'downloads').mkdir()
        first = module.fingerprint(['src/App.tsx'])
        candidate.write_text('const a = 2\n', encoding='utf-8')
        assert module.fingerprint(['src/App.tsx']) != first
        module.atomic(module.CACHE / 'state.json', json.dumps({'status': 'FAIL', 'stage': 'jscpd'}))
        old_report = work / 'downloads' / module.REPORT_NAME
        old_report.write_text('FINAL: FAIL\n', encoding='utf-8')
        before = sorted(str(p.relative_to(work)) for p in work.rglob('*'))
        with contextlib.redirect_stdout(io.StringIO()) as output:
            module.status()
        after = sorted(str(p.relative_to(work)) for p in work.rglob('*'))
        assert before == after, 'status modified files'
        assert 'FINAL: FAIL' in output.getvalue() and 'READ ONLY' in output.getvalue()
    finally:
        module.ROOT = old_root
        module.CACHE = old_cache
        module.downloads = old_downloads
with patch.object(module, 'cmd', return_value=SimpleNamespace(returncode=0, stdout=' M x\n?? y\n', stderr='')):
    assert module.git('status', '--porcelain=v1') == ' M x\n?? y'
with patch.object(module, 'cmd', return_value=SimpleNamespace(returncode=0, stdout='  x\0', stderr='')):
    assert module.git('ls-files', '-z') == '  x\0'
s={'id':'r','pid':5,'status':'PASS','stage':'complete','fingerprint':'fp'}
lines=['Run ID: r','Fingerprint: fp',*('PASS: '+n for n in module.STAGES),
       'FINAL SOURCE / GIT INTEGRITY: PASS','Source integrity: PASS; Git status unchanged: PASS','FINAL: PASS']
assert module.final_ok('r',0,s,lines,'fp',5)
assert not module.final_ok('old',0,s,lines,'fp',5)
assert not module.final_ok('r',1,s,lines,'fp',5)
assert not module.final_ok('r',0,s,lines[:-1],'fp',5)
android_env = {
    'VITE_ORBIS_CUSTOMER_API_URL': 'https://identity.example.com',
    'VITE_KHATA_DATA_URL': 'https://data.example.com/functions/v1/orbis-khata-data',
}
module.android_preflight(android_env)
for invalid in ({}, {**android_env, 'VITE_KHATA_DEMO': 'true'},
                {**android_env, 'VITE_KHATA_DATA_URL': 'http://localhost'},
                {**android_env, 'VITE_ORBIS_CUSTOMER_API_URL': 'https://user:secret@example.com'}):
    try:
        module.android_preflight(invalid)
    except RuntimeError:
        pass
    else:
        raise AssertionError('Unsafe Android configuration accepted')
with tempfile.TemporaryDirectory() as td:
    p = Path(td) / module.REPORT_NAME
    p.write_text('Run ID: r\nFINAL: PASS\n')
    with patch.object(module.shutil, 'which', return_value='/bin/true'), patch.object(module.subprocess, 'run', return_value=SimpleNamespace(returncode=0)):
        assert module.share_report(p, 'r')
        assert not module.share_report(p, 'stale')
print('SELFTEST: PASS | stage order, fingerprint invalidation, atomic state, read-only status')
