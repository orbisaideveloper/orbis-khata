#!/usr/bin/env python3
"""Static acceptance contract. No real credentials or customer records are accessed."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
workflow=(root / '.github/workflows/android-real-user.yml').read_text()
script=(root / 'scripts/android-real-user-run.sh').read_text()
java=(root / 'android/app/src/androidTest/java/com/orbisaideveloper/khata/AndroidAuthenticatedAcceptanceTest.java').read_text()
must = (
    ('manual trigger', 'workflow_dispatch:' in workflow),
    ('write confirmation', 'confirm_test_only == true' in workflow),
    ('single-script emulator execution', 'script: bash scripts/android-real-user-run.sh' in workflow),
    ('shell syntax check', 'bash -n scripts/android-real-user-run.sh' in workflow),
    ('known Android test runner', 'python3 scripts/khata.py test android-device' in script),
    ('instrumentation command', 'adb shell am instrument -w -r' in script),
    ('JSON artifact', 'status.json' in script),
    ('GitHub commit env', '$GITHUB_SHA' in script),
    ('no YAML interpolation in bash script', '${{' not in script),
    ('reviewer identity guard', 'ORB-U-DEE7F753' in java),
    ('isolated company name', 'ORBIS Automation Test' in java),
    ('return to Khata home', 'return to Khata home' in java),
    ('confirmed active company', 'Unexpected active company' in java),
    ('Bengali UI navigation', "document.documentElement.lang==='bn'" in java),
    ('accounting assertions', 'remaining receivable INR 120' in java),
)
for name, ok in must:
    if not ok:
        raise SystemExit('PRECHECK FAIL: '+name)
    print('PRECHECK PASS: '+name)
print('STATIC WORKFLOW CONTRACT PASS; Android login requires separate manual acceptance')

# Static UI contracts: these are NOT live Android assertions.
app=(root/'src/App.tsx').read_text()
account=(root/'src/auth/AccountForm.tsx').read_text()
cards=(root/'src/WorkspaceCards.tsx').read_text()
companies=(root/'src/accounting/Accounting.tsx').read_text()
books=(root/'src/demo/DemoWorkspace.tsx').read_text()
payment=(root/'src/accounting/PaymentEntry.tsx').read_text()
ledger=(root/'src/accounting/LedgerExplorer.tsx').read_text()
invoice=(root/'src/demo/InvoicePage.tsx').read_text()
source_checks = (
 ('reviewer display', 'className="orbis-account-id"' in app),
 ('login inputs', 'name="email"' in account and 'name="password"' in account),
 ('workspace card', 'data-workspace-card={id}' in cards),
 ('company create action', 'setCreate(true)' in companies),
 ('khata home', 'onClick={homeBooks}' in app),
 ('books navigation', 'className="books-navigation"' in books),
 ('company route', 'navigation.page === \'company\'' in books),
 ('party and item pages', 'navigation.page === \'parties\'' in books and 'navigation.page === \'items\'' in books),
 ('sale button', 'className="books-card kh-bill-start"' in books),
 ('payment form', 'className="books-card workspace-settings"' in payment),
 ('party ledger', 'className="ledger-detail"' in ledger),
 ('invoice fields', 'aria-label={`${t.quantity} ${index + 1}`}' in invoice and 'aria-label={`${t.rate} ${index + 1}`}' in invoice),
 ('no forced navigation', 'PopStateEvent(' not in java),
 ('safe stage codes', 'ORBIS_AUTH_STAGE' in java and 'WRONG_IDENTITY' in java),
)
for label, passed in source_checks:
    if not passed: raise SystemExit('SOURCE CONTRACT FAIL: '+label)
    print('SOURCE CONTRACT PASS: '+label)
# Run the real shell driver with stubbed tooling in a disposable directory.
# This checks command grouping, Android argument count, success and fail closed
# without a network, an Android emulator, any private credentials or test data.
import json
import os
import subprocess
import tempfile

subprocess.run(['bash', '-n', str(root / 'scripts/android-real-user-run.sh')], check=True)
with tempfile.TemporaryDirectory(prefix='orbis-acceptance-mock-') as temp:
    sandbox=Path(temp)
    bin_dir=sandbox / 'bin'
    bin_dir.mkdir()
    python_stub=bin_dir / 'python3'
    python_stub.write_text('#!/bin/sh\n[ "$1" = scripts/khata.py ] && [ "$2" = test ] && [ "$3" = android-device ]\n')
    adb_stub=bin_dir / 'adb'
    adb_stub.write_text('#!/bin/sh\ncase "$1" in\n  install) exit 0;;\n  shell) [ "$2" = am ] && [ "$3" = instrument ] || exit 10; [ "${MOCK_INSTRUMENT_FAIL:-0}" = 1 ] && exit 12; echo "INSTRUMENTATION_STATUS: ok"; echo "OK (1 test)";;\n  exec-out) printf PNG;;\n  *) exit 11;;\nesac\n')
    python_stub.chmod(0o755)
    adb_stub.chmod(0o755)
    env=os.environ.copy()
    env.update({
        'PATH': str(bin_dir) + os.pathsep + env.get('PATH', ''),
        'TEST_EMAIL': 'synthetic@example.invalid',
        'TEST_PASSWORD': 'fake-secret-no-real-account',
        'RUN_ID': '12345',
        'GITHUB_SHA': 'a'*40,
    })
    run=subprocess.run(['bash', str(root / 'scripts/android-real-user-run.sh')],
                       cwd=sandbox,env=env,capture_output=True,text=True)
    assert run.returncode == 0, 'Mock driver failed: ' + run.stdout[-300:] + run.stderr[-300:]
    report_dir=sandbox / 'android/app/build/reports/real-user'
    status=json.loads((report_dir / 'status.json').read_text())
    assert status['result']=='PASS' and status['run_id']=='12345'
    assert 'OK (1 test)' in (report_dir / 'instrumentation.txt').read_text()
    # A failed instrumentation must fail closed with a FAIL status artifact.
    env['MOCK_INSTRUMENT_FAIL']='1'
    (report_dir / 'status.json').unlink()
    failed=subprocess.run(['bash',str(root/'scripts/android-real-user-run.sh')],
                          cwd=sandbox,env=env,capture_output=True,text=True)
    assert failed.returncode != 0, 'Instrumentation error suppressed'
    failed_status=json.loads((report_dir/'status.json').read_text())
    assert failed_status['result']=='FAIL', 'Failed Android test reported PASS'
    env.pop('MOCK_INSTRUMENT_FAIL')
    # A missing secret must reject before any test operation.
    env.pop('TEST_PASSWORD')
    missing=subprocess.run(['bash', str(root / 'scripts/android-real-user-run.sh')],
                           cwd=sandbox,env=env,capture_output=True,text=True)
    assert missing.returncode != 0, 'Missing test secret was not rejected'
    print('MOCK RUNNER: PASS (success path, failure path, no live credentials)')
