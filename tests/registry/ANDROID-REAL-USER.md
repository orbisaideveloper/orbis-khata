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
