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

sys.dont_write_bytecode = True
source = Path(__file__).with_name('khata.py')
spec = importlib.util.spec_from_file_location('khata_under_test', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert module.STAGES == ['ubuntu-preflight', 'knip', 'jscpd', 'playwright', 'npm-ls',
                         'npm-audit', 'lint', 'typecheck', 'build', 'coverage']
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
print('SELFTEST: PASS | stage order, fingerprint invalidation, atomic state, read-only status')
