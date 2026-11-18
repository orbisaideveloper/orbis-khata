# ORBIS Android authenticated acceptance — controlled manual lane

Preconditions: The reviewer login is a dedicated Khata test identity, not Google Play Console login.
Secrets KHATA_TEST_EMAIL and KHATA_TEST_PASSWORD must be set under GitHub Settings > Secrets and variables > Actions.
The existing private Google Drive reviewer password cannot be read by GitHub Actions automatically.
Only GitHub Actions secrets, never a committed file, may supply the password.
After secrets are present: Actions > Khata Android Real User Acceptance > Run workflow > confirm_test_only.
Runs only on manual dispatch, never automatically on a push. Missing secrets make the run FAIL CLOSED.
Verifies central reviewer display ID ORB-U-DEE7F753 before writes, then creates/selects ORBIS Automation Test local company.
Creates synthetic Party and Item records under that exact company. Does not delete existing reviewer demo data.
Credentials are passed only to ephemeral emulator instrumentation, not built into APK. Restrict artifact access.
Results: GitHub Actions log and 14-day screenshot/report artifact.
NOT YET COMPLETE: actual authenticated run cannot be certified until GitHub Secrets are provided and the workflow succeeds.
Bill, Payment, Ledger, backup, offline and cloud sync remain separate pending cases. No blanket full-user-test PASS.

Security hardening: emulator receives only an ephemeral Base64-encoded password argument (not a password literal in a remote shell command). Base64 is an encoding, **not encryption**; the GitHub encrypted secret and runner isolation remain mandatory. The report includes a non-sensitive JSON PASS record only if instrumentation has `OK (1 test)`; failures cannot be called PASS.

Accounting extension (implemented but NOT YET VERIFIED): synthetic sales invoice qty 2 × INR 100 = INR 200, independent cash receipt INR 80, party ledger remaining receivable INR 120. Test records use a GitHub Run ID and only the verified ORBIS Automation Test local company. No real user financial records touched. No authenticated test-run evidence until owner installs secrets.

Manual live APK build uses the same configurable Central Admin staging/API URLs as the verified Android candidate workflow. This does not authorize deployment or publish. Be alert to cold-start latency and fail closed on reviewer login timeout.

## 18 November 2026: authentication-stage diagnostic (not an acceptance PASS)

The fifth manual run (`44249472585`) passed Android build and reached a real
sign-in attempt, but failed on `Expected central reviewer identity missing`.
The original test repeatedly fired a synthetic `PopStateEvent` to try to reach
`workspace`; this does **not** establish authentication and could disrupt React
navigation. The acceptance test now waits for the normal signed-in render,
while emitting **allow-listed** `ORBIS_AUTH_STAGE` markers (submitted, pending,
form error, native enrollment/restore error, wrong identity, verified). Neither
credentials nor tokens nor HTTP response bodies are logged. If identity is
unverified, no synthetic company or accounting records may be written.

The shell runner now emits `status.json` as `FAIL` for a failing
instrumentation/runner command and `PASS` only after `OK (1 test)`; a
non-sensitive `instrumentation.txt` remains the source of detailed stage
messages. This is implemented test-infrastructure improvement, **not proof of
fixed server authentication**. Review the protected GitHub artifact before
considering another manual run.

Local validation is intentionally distinct from Live CI: YAML/manual-only
settings, bash syntax, mock success and failure (including instrumentation
failure), source-selector contracts and a Java source compile with minimal
mock Android APIs can run without credentials. Full React tests require the
project dependency tree; an actual APK, Capacitor runtime and central Admin
login require Android SDK/Emulator and reachable staging APIs.
