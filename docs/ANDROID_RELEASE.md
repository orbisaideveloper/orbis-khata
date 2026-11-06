# Khata Boi Android release

Owner-approved preparation, 6 November 2026. Base main:
`d26981d389f3f5ca727a56eb769e1bda70f0b150`. Not release certification.

## Architecture and identity

- App: Khata Boi; developer: Orbis AI Developer.
- Application ID: com.orbisaideveloper.khata, matching the owner's Console draft.
- Capacitor 8 packages the existing React dist assets. Web/Render remains separate.
- No remote server.url, alternate accounting engine, production demo, native HTTP
  authorization bypass or new database. Existing financial documents stay intact.
- Android origin is https://localhost. Central Admin and Khata Edge must explicitly
  allow this exact origin AND retain live session/company authorization. CORS is
  not authorization. Do not use wildcard origins or disable authentication.
- Android and web have separate local sessions/pending state, using the same cloud
  books after secure login. No token copying or automatic financial resubmission.
- Android skips Service Worker registration. Bundled screens are not offline books
  or offline posting. Online identity verification remains required.
- Recovery links finish on the existing HTTPS web app; sign in again on Android.
  Automatic verified App Links are not implemented.
- PDF/XLSX use the Android share chooser, cache-only FileProvider grants and private
  temporary files. Files remain until Android clears cache because recipients may
  read after chooser return. Backup/device transfer are disabled. Uninstall loses
  local pending state; finish uncertain operations first. Cloud data is not a backup.
- No contacts, camera, microphone or broad-storage permission added.

## One runner

Prerequisites: Node24, locked npm dependencies, JDK21+, Android SDK36 with compatible
build tools. The owner reviews/accepts applicable SDK terms in their environment.
Native Android SDK tools are not guaranteed on Termux ARM64; GitHub Ubuntu is the
planned build host. No new wrappers/installers.

Set public build variables VITE_ORBIS_CUSTOMER_API_URL and VITE_KHATA_DATA_URL to
reviewed existing deployment addresses. Never put service-role keys/tokens in VITE
variables. VITE_KHATA_DEMO, VITE_KHATA_GUEST_UI and VITE_KHATA_PREVIEW must be absent
or false. Missing endpoints/guest flags fail closed in the runner.

`python3 scripts/khata.py test android`

Builds web, syncs plugins/assets, runs Android lint and creates a debug APK.
Template 2+2 JVM tests were removed. No JVM-test PASS is claimed for NO-SOURCE.
The real PackageSafetyTest needs an emulator/device: connectedDebugAndroidTest.

GitHub workflow: Khata Android candidate runs on relevant main pushes or manual
dispatch. It uses the reviewed existing public API addresses, with repository
Variables available as overrides; workflow uses JDK21 and installed SDK36. It creates an exact-SHA debug APK artifact. It never publishes, uses upload
keys, migrates or deploys. No execution is claimed before a successful exact-SHA run.

`python3 scripts/khata.py test android-release`

Requires owner-controlled environment: KHATA_UPLOAD_STORE_FILE (absolute path),
KHATA_UPLOAD_STORE_PASSWORD, KHATA_UPLOAD_KEY_ALIAS, KHATA_UPLOAD_KEY_PASSWORD,
KHATA_ANDROID_VERSION_CODE and KHATA_ANDROID_VERSION_NAME. Release Gradle tasks
also reject missing signing/version configuration. Never use the debug key.
Keep upload key and recoverable backup outside git, chat, screenshots and shell
history. No key has been generated. Verify AAB signature/certificate, package and
version before upload. Only a successful release build creates:
android/app/build/outputs/bundle/release/app-release.aab.

## Mandatory release order

1. Reviewed canonical mobile/desktop preview and owner approval.
2. Separate approval for exact Android-origin backend configuration; re-test both
   API preflights, invalid sessions and company isolation. No migration assumed.
3. Real compile/lint, install APK, instrumented package safety test and BN/HI/EN
   phone checks: login/recovery, company switch, saves/retries, keyboard/insets,
   background/resume, Android Back, PDF/XLSX share and interrupted connection.
   Financial test writes use approved disposable accounts only.
4. Review security, deletion/recovery, actual backup/restore and data declarations.
   Review Lottery against current Play policies; bookkeeping scope does not itself
   establish gambling-policy permission. No policy approval is assumed.
5. Owner-requested final certification, approved push, exact-SHA Actions/Sonar.
6. Owner signing and signature-verified AAB, existing Draft -> Internal testing.
7. Complete Privacy Policy URL, accurate Data Safety, reviewer login access,
   account deletion, ads/audience/content rating, store icon/screenshots/text.
8. Console-required Closed testing and production-access review, then explicit
   owner approval for public rollout. Draft/bundle upload is not public release.

## Future updates

Same repo, application ID and signing continuity; increase versionCode each Play
update. Review main SHA -> tests -> signed new AAB -> Internal test -> approved
rollout. Play receives the bundle, not the repository. Web has separate Render
deploys. Render updates do not replace bundled native screens. Backend changes
must remain compatible with older installed versions. No old accounting entry
is replaced by an Android app update.

## Verified first-slice blockers

Live OPTIONS from https://localhost returned403 CUSTOMER_ORIGIN_DENIED at Central
Admin and403 KHATA_ORIGIN_DENIED at Khata Edge. No live setting was changed.
Local JDK17 does not meet JDK21; no Android SDK/emulator or signed AAB verified.
Playwright official browser download returned truncated archives; web preview is
not certified. Targeted adapter tests are separate from native-device evidence.
Record current exact outcomes in PROJECT_STATUS.md and the single latest report.
