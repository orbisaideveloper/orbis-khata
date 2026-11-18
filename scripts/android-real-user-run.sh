#!/usr/bin/env bash
set -euo pipefail
set +x
: "${TEST_EMAIL:?Test email not set}"
: "${TEST_PASSWORD:?Test password not set}"
: "${RUN_ID:?Run identifier not set}"
: "${GITHUB_SHA:?Commit SHA not set}"
report_dir="android/app/build/reports/real-user"
mkdir -p "$report_dir"
# This trap writes a machine-readable FAIL if any tool or instrumentation stage
# returns nonzero. It never prints or records the reviewer password.
finish_report() {
  local exit_code=$?
  trap - EXIT
  adb exec-out screencap -p > "$report_dir/final-screen.png" 2>/dev/null || true
  if (( exit_code != 0 )); then
    printf '{"schema":"orbis.android.real_user.v1","result":"FAIL","run_id":"%s","commit":"%s","stage":"RUNNER_OR_INSTRUMENTATION","evidence":"instrumentation.txt"}\n' "$RUN_ID" "$GITHUB_SHA" > "$report_dir/status.json"
  fi
  exit "$exit_code"
}
trap finish_report EXIT
python3 scripts/khata.py test android-device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
pass_b64="$(printf '%s' "$TEST_PASSWORD" | base64 -w0)"
adb shell am instrument -w -r \
  -e class com.orbisaideveloper.khata.AndroidAuthenticatedAcceptanceTest \
  -e khata_email "$TEST_EMAIL" \
  -e khata_password_b64 "$pass_b64" \
  -e khata_run "$RUN_ID" \
  com.orbisaideveloper.khata.test/androidx.test.runner.AndroidJUnitRunner \
  > "$report_dir/instrumentation.txt" 2>&1
unset pass_b64
if ! grep -q '^OK (1 test)' "$report_dir/instrumentation.txt"; then
  echo 'Authenticated acceptance FAILED; inspect protected instrumentation artifact'
  exit 1
fi
printf '{"schema":"orbis.android.real_user.v1","result":"PASS","run_id":"%s","commit":"%s","tenant":"ORBIS Automation Test","test":"login-company-party-item-sale-receipt-ledger"}\n' "$RUN_ID" "$GITHUB_SHA" > "$report_dir/status.json"
echo 'Authenticated acceptance PASS; evidence artifact generated'
