#!/usr/bin/env bash
set -euo pipefail
report_dir=android/app/build/reports/native-keystore
mkdir -p "$report_dir"
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk >/dev/null
adb logcat -c || true
if ! adb shell am instrument -w -r -e class com.orbisaideveloper.khata.AndroidKeystoreCapabilityTest com.orbisaideveloper.khata.test/androidx.test.runner.AndroidJUnitRunner > "$report_dir/instrumentation.txt" 2>&1; then
 echo "ORBIS_PROBE_INSTRUMENTATION_NONZERO" >> "$report_dir/instrumentation.txt"
fi
adb logcat -d -s ORBIS_KEYSTORE:I '*:S' > "$report_dir/logcat.txt" 2>/dev/null || true
capability=""
for c in HARDWARE_CONFIRMED SOFTWARE_ONLY PROBE_UNAVAILABLE; do
 if grep -q "ORBIS_KEYSTORE_CAPABILITY=$c" "$report_dir/instrumentation.txt" "$report_dir/logcat.txt"; then capability="$c";break;fi
done
case "$capability" in
 HARDWARE_CONFIRMED) outcome=PASS_HARDWARE_KEY ;;
 SOFTWARE_ONLY) outcome=BLOCKED_SOFTWARE_KEYSTORE ;;
 PROBE_UNAVAILABLE) outcome=INCONCLUSIVE_PROBE_UNAVAILABLE ;;
 *) outcome=INCONCLUSIVE_NO_PROBE_RESULT ;;
esac
printf '{"schema":"orbis.android.keystore.probe.v1","result":"%s","capability":"%s","no_credentials_used":true}\n' "$outcome" "$capability" > "$report_dir/status.json"
echo "ORBIS_KEYSTORE_PROBE_RESULT=$outcome"
[ "$outcome" != INCONCLUSIVE_NO_PROBE_RESULT ]
