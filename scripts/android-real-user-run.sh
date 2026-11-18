#!/usr/bin/env bash
set -euo pipefail
set +x
python3 scripts/khata.py test android-device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
mkdir -p android/app/build/reports/real-user
set +x
PASS_B64=$(printf %s "$TEST_PASSWORD" | base64 -w0)
adb shell am instrument -w -r \
  -e class com.orbisaideveloper.khata.AndroidAuthenticatedAcceptanceTest \
  -e khata_email "$TEST_EMAIL" \
  -e khata_password_b64 "$PASS_B64" \
  -e khata_run "$RUN_ID" \
  com.orbisaideveloper.khata.test/androidx.test.runner.AndroidJUnitRunner \
  > android/app/build/reports/real-user/instrumentation.txt 2>&1
unset PASS_B64
adb exec-out screencap -p > android/app/build/reports/real-user/final-screen.png || true
grep -q 'OK (1 test)' android/app/build/reports/real-user/instrumentation.txt
printf '{"schema":"orbis.android.real_user.v1","result":"PASS","run_id":"%s","commit":"%s","tenant":"ORBIS Automation Test","test":"login-company-party-item-sale-receipt-ledger","report_note":"Only owner-invoked credentials-gated Android acceptance"}\n' "$RUN_ID" "$GITHUB_SHA" > android/app/build/reports/real-user/status.json
