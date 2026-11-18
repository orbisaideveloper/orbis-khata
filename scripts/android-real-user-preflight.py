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
