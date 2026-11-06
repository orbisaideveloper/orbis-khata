#!/usr/bin/env python3
"""ORBIS Khata: one report, exact local source, guarded resumable quality runner."""
from __future__ import annotations
import fcntl
import base64
import contextlib
import tempfile
import xml.etree.ElementTree as ET
from urllib.request import urlopen
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import time
from urllib.parse import urlparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path.home() / '.cache/orbis-khata-quality'
REPORT_NAME = 'ORBIS-KHATA-LATEST-REPORT.txt'
EXPECTED_REMOTE = 'orbisaideveloper/orbis-khata'
APPROVED_UNTRACKED = {'docs/UI_PHASE_01.md', 'docs/UI_PHASE_02.md', 'docs/UI_PHASE_03.md',
                      'docs/UI_PHASE_04.md', 'src/i18n.ts', 'scripts/khata.py', 'scripts/khata-selftest.py'}
APPROVED_UNTRACKED.update({
    'src/auth/client.ts', 'src/auth/client.test.ts', 'src/auth/copy.ts',
    'src/auth/AppSession.test.tsx', 'src/auth/useAccount.ts', 'src/auth/useAccount.test.tsx',
    'src/auth/AccountForm.tsx', 'src/auth/AccountForm.test.tsx',
    'src/auth/CompanyGate.tsx', 'src/auth/CompanyGate.test.tsx',
    'docs/khata-company-proposal.sql', 'docs/AUTH_SETUP.md',
    'src/accounting/Accounting.tsx', 'src/accounting/Accounting.test.tsx',
    'src/accounting/api.ts', 'src/accounting/api.test.ts', 'src/accounting/model.ts',
    'src/accounting/model.test.ts', 'src/accounting/copy.ts', 'src/accounting/accounting.css',
    'docs/accounting-v1.sql', 'docs/ACCOUNTING_V1.md',
})
APPROVED_UNTRACKED.update({'src/inventory/copy.ts', 'src/inventory/api.ts', 'src/WorkspaceMenu.tsx', 'src/inventory/recovery.test.tsx', 'src/inventory/pending.ts', 'src/inventory/model.ts', 'src/WorkspaceMenu.test.tsx', 'docs/inventory-v1.review.sql', 'src/inventory/Inventory.test.tsx', 'src/tutorial.ts', 'docs/INVENTORY_ACTIVATION.md', 'src/inventory/Inventory.tsx', 'src/inventory/gateway.test.ts', 'src/inventory/model.test.ts'})
APPROVED_UNTRACKED.update({'pwa/build.ts', 'pwa/worker-check.mjs', 'public/manifest.webmanifest', 'public/icon.svg', 'src/PwaStatus.tsx', 'src/PwaStatus.test.tsx', 'e2e-central/pwa.spec.ts', 'docs/PWA.md'})
APPROVED_UNTRACKED.add('src/inventory/api.test.ts')
APPROVED_UNTRACKED.update({
    'e2e-central/stock-transfer.spec.ts', 'scripts/verify-warehouse-transfer.mjs',
    'scripts/warehouse-transfer-cases.mjs', 'src/accounting/OutstandingPreview.tsx',
    'src/accounting/OutstandingPreview.test.tsx', 'src/inventory/StockTransfer.tsx',
    'src/inventory/StockTransfer.test.tsx', 'src/inventory/StockWorkspace.tsx',
    'src/inventory/StockWorkspace.test.tsx', 'src/inventory/warehouse-value.ts',
    'src/inventory/warehouse-value.test.ts',
    'supabase/migrations/20261105040047_warehouse_transfer_stock_guard.sql',
    'docs/STOCK_TRANSFER_VERIFICATION.md',
})
APPROVED_UNTRACKED.update({'android/capacitor.settings.gradle', 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 'android/build.gradle', 'android/gradle.properties', 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 'android/app/src/main/res/drawable-land-hdpi/splash.png', 'android/app/src/main/res/drawable-port-xhdpi/splash.png', 'android/app/src/main/res/drawable-port-hdpi/splash.png', 'android/app/src/main/res/drawable-land-xxhdpi/splash.png', 'android/app/proguard-rules.pro', 'android/app/src/androidTest/java/com/orbisaideveloper/khata/PackageSafetyTest.java', 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 'src/native/platform.ts', 'android/app/src/main/res/drawable/splash.png', 'android/app/src/main/res/layout/activity_main.xml', 'android/app/src/main/res/drawable-port-xxhdpi/splash.png', 'android/app/src/main/res/xml/file_paths.xml', 'android/gradlew.bat', 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 'android/app/src/main/res/drawable-port-xxxhdpi/splash.png', 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', 'src/native/platform.test.ts', 'android/app/.gitignore', 'android/app/src/main/AndroidManifest.xml', 'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png', 'android/app/src/main/res/values/styles.xml', 'android/app/src/main/res/drawable-land-mdpi/splash.png', 'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 'android/gradlew', 'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 'android/app/src/main/res/values/strings.xml', 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 'android/settings.gradle', 'android/app/src/main/res/drawable-port-mdpi/splash.png', 'android/app/capacitor.build.gradle', 'android/app/src/main/res/drawable/ic_launcher_background.xml', 'android/variables.gradle', 'src/native/share-file.test.ts', 'capacitor.config.json', 'android/app/src/main/res/drawable-land-xhdpi/splash.png', 'android/app/src/main/res/drawable-land-xxxhdpi/splash.png', 'android/gradle/wrapper/gradle-wrapper.properties', 'android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml', 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 'android/app/src/main/res/xml/data_extraction_rules.xml', 'android/.gitignore', 'android/app/build.gradle', 'android/app/src/main/res/values/ic_launcher_background.xml', '.github/workflows/android.yml', 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', 'android/app/src/main/java/com/orbisaideveloper/khata/MainActivity.java', 'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png', 'android/gradle/wrapper/gradle-wrapper.jar', 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', 'src/native/share-file.ts'})

APPROVED_UNTRACKED.add('docs/ANDROID_RELEASE.md')

STAGES = ['ubuntu-preflight', 'knip', 'jscpd', 'playwright', 'npm-ls', 'npm-audit',
          'lint', 'typecheck', 'build', 'sql', 'coverage']


APPROVED_UNTRACKED.update({'scripts/verify-phase2.mjs', 'scripts/phase2-safety-cases.mjs', 'supabase/migrations/20261101191307_lottery_party_sharing.sql', 'supabase/migrations/20261029141429_atomic_invoice_save.sql', 'supabase/migrations/20261029180310_account_json_alias.sql', 'docs/PHASE2_SECURITY_CHANGES.md', 'src/accounting/gateway-admission.test.ts', 'supabase/migrations/20261024042046_central_owner_bridge_preserve_trial_books.sql', 'supabase/migrations/20261105040047_warehouse_transfer_stock_guard.sql', 'src/accounting/gateway-admission.ts', 'supabase/migrations/20261031081126_continuous_production.sql', 'supabase/migrations/20260921180314_create_khata_companies_owner_rls.sql', 'supabase/migrations/20261029123240_fiscal_bill_numbering.sql', 'supabase/migrations/20261101144338_expense_profile_schedules.sql', 'supabase/migrations/20261030150510_allow_bill_advances.sql', 'supabase/migrations/20261025165618_activate_itemized_bills_inventory_v1.sql', 'supabase/migrations/20261028184713_khata_accounting_completion_v3.sql', 'supabase/migrations/20261031075245_lottery_row_storage.sql', 'supabase/migrations/20260921184447_khata_accounting_v1.sql', 'supabase/migrations/20261025165602_activate_expense_subledger_v1.sql', 'supabase/migrations/20261105084705_gateway_request_admission.sql', 'supabase/migrations/20261029074356_editable_party_opening_balance.sql', 'supabase/migrations/20261026081216_khata_live_masters_precise_bills_v2.sql', 'supabase/migrations/20261102075520_master_party_link_metadata.sql', 'supabase/migrations/20261030031036_independent_lottery.sql', 'supabase/migrations/20261104122849_report_revision_and_party_lookup.sql', 'supabase/migrations/20261029131705_short_bill_numbers.sql', 'supabase/migrations/20261029141757_qualify_expense_correction.sql', 'supabase/migrations/20261105101338_safe_retired_company_purge.sql'})

def cmd(args, cwd=ROOT, capture=True, **kwargs):
    return subprocess.run(args, cwd=cwd, text=True, capture_output=capture, **kwargs)


def git(*args):
    result = cmd(['git', *args])
    if result.returncode:
        raise RuntimeError('git ' + ' '.join(args) + ': ' + (result.stderr or result.stdout).strip())
    return result.stdout.rstrip('\r\n')


def downloads():
    path = Path.home() / 'storage/downloads'
    if not path.is_dir() or not os.access(path, os.W_OK):
        raise RuntimeError('Downloads unavailable: run termux-setup-storage and verify ~/storage/downloads')
    return path


def safe_files():
    names = set(filter(None, git('ls-files', '-z').split('\0')))
    others = set(filter(None, git('ls-files', '--others', '--exclude-standard', '-z').split('\0')))
    unexpected = sorted(others - APPROVED_UNTRACKED)
    if unexpected:
        raise RuntimeError('Unexpected untracked paths; review before verify: ' + ', '.join(unexpected[:15]))
    if not (ROOT / 'AGENTS.md').is_file() or not (ROOT / 'package-lock.json').is_file():
        raise RuntimeError('Missing AGENTS.md or package-lock.json')
    result = sorted(names | others)
    for name in result:
        path = ROOT / name
        if path.is_symlink() or not path.is_file() or '..' in Path(name).parts or name.startswith('/'):
            raise RuntimeError('Unsafe snapshot path: ' + name)
        if re.search(r'(^|/)(\.env[^/]*|id_rsa|.*\.pem|.*\.key)$', name, flags=re.I):
            raise RuntimeError('Potential sensitive file; STOP: ' + name)
    return result


def fingerprint(names):
    digest = hashlib.sha256()
    for name in names:
        digest.update(name.encode() + b'\0')
        digest.update(hashlib.sha256((ROOT / name).read_bytes()).digest())
    return digest.hexdigest()


def env_versions():
    versions = []
    for command in (['node', '--version'], ['npm', '--version']):
        res = cmd(command)
        versions.append(res.stdout.strip() if res.returncode == 0 else 'UNAVAILABLE')
    if not shutil.which('proot-distro'):
        if 'ID=ubuntu' not in Path('/etc/os-release').read_text():
            raise RuntimeError('Ubuntu runtime unavailable')
        return versions + ['Ubuntu native; Android/Termux NOT VERIFIED']
    res = cmd(['proot-distro', 'login', 'ubuntu', '--', 'bash', '-lc', 'node --version && npm --version'])
    versions.append(res.stdout.strip() if res.returncode == 0 else 'UNAVAILABLE')
    return versions


def baseline():
    if ROOT.name != 'orbis-khata' or not (ROOT / '.git').exists():
        raise RuntimeError('Wrong repository root: ' + str(ROOT))
    branch = git('branch', '--show-current')
    head = git('rev-parse', 'HEAD')
    remote = git('remote', 'get-url', 'origin')
    if branch != 'main' or remote not in (
            'https://github.com/' + EXPECTED_REMOTE,
            'https://github.com/' + EXPECTED_REMOTE + '.git',
            'git@github.com:' + EXPECTED_REMOTE + '.git'):
        raise RuntimeError('Unexpected branch/remote; no run: ' + branch + ' / ' + remote)
    for arg in (['diff', '--check'], ['diff', '--cached', '--check']):
        res = cmd(['git', *arg])
        if res.returncode:
            raise RuntimeError('Whitespace/merge conflict: ' + res.stdout + res.stderr)
    return branch, head, remote


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name('.' + path.name + '.tmp-' + str(os.getpid()))
    tmp.write_text(data, encoding='utf-8')
    os.replace(tmp, path)


def is_alive(pid):
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def status():
    state = read_json(CACHE / 'state.json')
    try:
        report = downloads() / REPORT_NAME
    except RuntimeError:
        report = Path.home() / 'storage/downloads' / REPORT_NAME
    print('ORBIS KHATA STATUS (READ ONLY)')
    if state:
        active = state.get('status') == 'RUNNING' and is_alive(state.get('pid'))
        print('RUN:', state.get('id', '?'), '|', 'RUNNING' if active else ('INTERRUPTED' if state.get('status') == 'RUNNING' else state.get('status', '?')))
        print('STAGE:', state.get('stage', '?'), '| SOURCE:', str(state.get('fingerprint', '?'))[:16])
    else:
        print('RUN: none recorded; runner may be newly installed')
    if report.is_file():
        lines = report.read_text(encoding='utf-8', errors='replace').splitlines()
        print('LAST FINAL REPORT:', str(report))
        for line in lines[-15:]:
            print(line[:250])
    else:
        print('LAST FINAL REPORT: missing/unavailable; no certification inferred')


def doctor():
    print('ORBIS KHATA DOCTOR — no tests')
    print('REPO:', ROOT)
    print('BRANCH/HEAD/REMOTE:', *baseline())
    names = safe_files()
    print('SOURCE FILES:', len(names), 'FINGERPRINT:', fingerprint(names))
    print('TOOLS:', env_versions())
    print('LAST REPORT:')
    status()
    print('Doctor checks are not certification or browser-launch proof.')


def run_ubuntu(script, out):
    arg = (['proot-distro', 'login', 'ubuntu', '--', 'bash', '-lc', script]
           if shutil.which('proot-distro') else ['bash', '-c', script])
    return subprocess.run(arg, stdout=out, stderr=subprocess.STDOUT, cwd=ROOT).returncode


def make_snapshot(names, source, run_dir):
    snapshot = run_dir / 'source.tar.gz'
    with tarfile.open(snapshot, 'w:gz') as archive:
        for name in names:
            archive.add(ROOT / name, arcname=name, recursive=False)
    manifest = run_dir / 'manifest.json'
    atomic(manifest, json.dumps({'fingerprint': source, 'files': names}, ensure_ascii=False))
    return snapshot


def worker(mode, run_id, lock_fd):
    _ = lock_fd  # inherited exclusive lock remains held until worker exits
    downloads_dir = downloads()
    run_dir = CACHE / 'runs' / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    state_path = CACHE / 'state.json'
    data = read_json(state_path)
    report = ['ORBIS KHATA — FULL LOCAL CERTIFICATION', 'Run ID: ' + run_id,
              'Started: ' + time.strftime('%Y-%m-%d %H:%M:%S %z'),
              'Command: khata ' + mode, 'Git writes / deploy / DB writes: NONE']
    outcome, failing = 'FAIL', 'preflight'
    started = time.time()
    names = []
    initial_status = ''
    source = ''
    versions = []
    checkpoint_path = CACHE / 'checkpoint.json'
    checkpoint = read_json(checkpoint_path) if mode == 'resume' else {}

    def stage_state(name):
        data.update(status='RUNNING', stage=name, pid=os.getpid())
        atomic(state_path, json.dumps(data, ensure_ascii=False))
        print('RUN:', name, flush=True)

    def gate(name, argv, ubuntu=False):
        nonlocal failing
        failing = name
        stage_state(name)
        report.append('RUN: ' + name)
        log = run_dir / (name + '.log')
        with log.open('w', encoding='utf-8') as stream:
            if ubuntu:
                rc = run_ubuntu(argv, stream)
            else:
                rc = subprocess.run(argv, stdout=stream, stderr=subprocess.STDOUT, cwd=ROOT).returncode
        content = log.read_text(encoding='utf-8', errors='replace')
        if rc:
            report.append('FAIL: ' + name + ' (exit ' + str(rc) + ')')
            report.append('FAILED STAGE FULL LOG:\n' + content)
            raise RuntimeError(name + ' failed; full log kept privately in cache')
        report.append('PASS: ' + name)
        # Capture numerical facts in one report, without flooding Downloads or chat.
        if name in ('coverage', 'jscpd', 'playwright', 'npm-audit'):
            report.append('RESULT EXCERPT:\n' + '\n'.join(content.splitlines()[-22:]))
        record = {'fingerprint': source, 'versions': versions, 'status': 'PASS',
                  'log': str(log), 'log_sha256': hashlib.sha256(log.read_bytes()).hexdigest()}
        checkpoint['stages'][name] = record
        atomic(checkpoint_path, json.dumps(checkpoint, ensure_ascii=False))

    try:
        branch, head, remote = baseline()
        names = safe_files()
        source = fingerprint(names)
        initial_status = git('status', '--porcelain', '--untracked-files=all')
        versions = env_versions()
        if 'UNAVAILABLE' in ' '.join(versions):
            raise RuntimeError('Environment missing Node/npm/Ubuntu')
        report.extend(['Branch: ' + branch, 'HEAD: ' + head, 'Remote: ' + remote,
                       'Fingerprint: ' + source, 'Source file count: ' + str(len(names)),
                       'Tool versions: ' + json.dumps(versions),
                       'Changed paths: ' + (initial_status or 'none')])
        if mode != 'resume' or checkpoint.get('fingerprint') != source or checkpoint.get('versions') != versions:
            checkpoint = {'fingerprint': source, 'versions': versions, 'stages': {}}
        checkpoint.setdefault('stages', {})
        atomic(checkpoint_path, json.dumps(checkpoint, ensure_ascii=False))
        snap = make_snapshot(names, source, run_dir)
        ubuntu_work = '/root/.cache/orbis-khata-quality/work-' + source
        # A new exact worktree can reuse native deps only for an identical fingerprint.
        old_preflight = checkpoint.get('stages', {}).get('ubuntu-preflight', {})
        prepare = f'''set -euo pipefail
W={shlex.quote(ubuntu_work)}
if [ ! -f "$W/.khata-source-fingerprint" ]; then
  mkdir -p "$W"
  tar -xzf {shlex.quote(str(snap))} -C "$W"
  printf '%s' {shlex.quote(source)} > "$W/.khata-source-fingerprint"
fi
cd "$W"
test "$(cat .khata-source-fingerprint)" = {shlex.quote(source)}
test -f package-lock.json
if [ ! -d node_modules ]; then npm ci --include=optional --no-fund --no-audit; fi
node -e "const p=require('oxc-parser'); if (!p.parseSync) process.exit(1); p.parseSync('check.ts','const x=1')" || {{
  npm ci --include=optional --no-fund --no-audit
  node -e "const p=require('oxc-parser'); p.parseSync('check.ts','const x=1')"
}}
node -e "const {{chromium}}=require('@playwright/test'); chromium.launch(process.env.KHATA_CHROMIUM_EXECUTABLE?{{executablePath:process.env.KHATA_CHROMIUM_EXECUTABLE}}:{{}}).then(b=>{{console.log('BROWSER_VERSION='+b.version());return b.close()}}).catch(e=>{{console.error(e);process.exit(1)}})" || {{
  ./node_modules/.bin/playwright install chromium --only-shell
  node -e "const {{chromium}}=require('@playwright/test'); chromium.launch(process.env.KHATA_CHROMIUM_EXECUTABLE?{{executablePath:process.env.KHATA_CHROMIUM_EXECUTABLE}}:{{}}).then(b=>{{console.log('BROWSER_VERSION='+b.version());return b.close()}}).catch(e=>{{console.error(e);process.exit(1)}})"
}}
'''
        # Always preflight exact native binding + actual browser launch even on resume.
        gate('ubuntu-preflight', prepare, ubuntu=True)
        def browser_version(logpath):
            if not logpath or not Path(logpath).is_file():
                return None
            matches = re.findall(r'^BROWSER_VERSION=([^\s]+)', Path(logpath).read_text(encoding='utf-8', errors='replace'), re.M)
            return matches[-1] if matches else None
        previous_browser = browser_version(old_preflight.get('log'))
        current_browser = browser_version(checkpoint['stages']['ubuntu-preflight']['log'])
        ubuntu_commands = {'knip': 'npm run quality:knip', 'jscpd': 'npm run quality:jscpd',
                           'playwright': 'CI=1 npm run test:e2e'}
        termux_commands = {'npm-ls': ['npm', 'ls', '--depth=0'],
                           'npm-audit': ['npm', 'audit', '--audit-level=low'],
                           'lint': ['npm', 'run', 'lint'], 'typecheck': ['npm', 'run', 'typecheck'],
                           'build': ['npm', 'run', 'build'], 'sql': ['npm', 'run', 'test:sql'], 'coverage': ['npm', 'run', 'test:coverage']}
        reuse_prefix = (mode == 'resume' and checkpoint.get('fingerprint') == source
                        and checkpoint.get('versions') == versions
                        and bool(current_browser) and current_browser == previous_browser)
        for name in STAGES[1:]:
            previous = checkpoint['stages'].get(name, {})
            old_log = Path(previous.get('log', '/dev/null'))
            valid = (reuse_prefix and previous.get('status') == 'PASS'
                     and previous.get('fingerprint') == source and previous.get('versions') == versions
                     and old_log.is_file() and hashlib.sha256(old_log.read_bytes()).hexdigest() == previous.get('log_sha256'))
            if valid:
                # Reuse only previously proven results for the exact source/tool fingerprint.
                report.append('REUSED VERIFIED PASS: ' + name)
                continue
            reuse_prefix = False  # earliest invalid stage invalidates every dependent stage
            if name in ubuntu_commands:
                gate(name, 'set -euo pipefail; cd ' + shlex.quote(ubuntu_work) + '; ' + ubuntu_commands[name], ubuntu=True)
            else:
                gate(name, termux_commands[name])
        stage_state('source-integrity')
        after = fingerprint(safe_files())
        status_after = git('status', '--porcelain', '--untracked-files=all')
        if source != after or initial_status != status_after:
            raise RuntimeError('Source fingerprint or Git status changed while verifying')
        report.append('Source integrity: PASS; Git status unchanged: PASS')
        outcome = 'PASS'
    except BaseException as exc:
        report.append('BLOCKED AT: ' + failing)
        report.append('CAUSE: ' + str(exc))
        report.append('NEXT: Fix only this cause; use khata resume. No Git write.')
    finally:
        if source and names:
            try:
                unchanged = (fingerprint(safe_files()) == source
                             and git('status', '--porcelain', '--untracked-files=all') == initial_status)
                report.append('FINAL SOURCE / GIT INTEGRITY: ' + ('PASS' if unchanged else 'FAIL'))
                if not unchanged:
                    outcome = 'FAIL'
            except Exception as integrity_error:
                report.append('FINAL SOURCE / GIT INTEGRITY: FAIL: ' + str(integrity_error))
                outcome = 'FAIL'
        else:
            report.append('FINAL SOURCE / GIT INTEGRITY: NOT VERIFIED')
        report.extend(['Elapsed seconds: ' + str(round(time.time() - started)),
                       'Git writes / deploy / DB writes: NONE', 'FINAL: ' + outcome,
                       'Finished: ' + time.strftime('%Y-%m-%d %H:%M:%S %z')])
        final = downloads_dir / REPORT_NAME
        if final.is_file():
            shutil.copy2(final, CACHE / 'previous-final-report.txt')
        atomic(final, '\n'.join(report) + '\n')
        data.update(status=outcome, stage=failing if outcome == 'FAIL' else 'complete', pid=os.getpid(),
                    finished=time.strftime('%Y-%m-%d %H:%M:%S %z'))
        atomic(state_path, json.dumps(data, ensure_ascii=False))
        print('FINISHED:', outcome, 'ONE REPORT:', final, flush=True)
    return 0 if outcome == 'PASS' else 1


def final_ok(run, rc, s, lines, fp, pid):
    return (rc == 0 and (s.get('id'),s.get('pid'),s.get('status'),
            s.get('stage'),s.get('fingerprint')) == (run,pid,'PASS','complete',fp)
            and all(x in lines for x in ('Run ID: '+run,'Fingerprint: '+fp,
            'FINAL SOURCE / GIT INTEGRITY: PASS',
            'Source integrity: PASS; Git status unchanged: PASS'))
            and lines.count('FINAL: PASS') == 1 and all('PASS: '+n in lines or
            'REUSED VERIFIED PASS: '+n in lines for n in STAGES))


def share_report(path, run_id):
    try:
        raw = path.read_bytes()
        if 'Run ID: ' + run_id not in raw.decode().splitlines():
            return False
        print('REPORT FILE:', path.resolve(), 'bytes:', len(raw),
              'sha256:', hashlib.sha256(raw).hexdigest(), flush=True)
        opener = shutil.which('termux-open')
        if not opener:return False
        result = subprocess.run([opener, '--send', '--chooser', '--content-type',
                                 'text/plain', str(path.resolve())],
                                timeout=15, capture_output=True)
        print('SHARE:', 'chooser requested; choose ChatGPT' if result.returncode == 0
              else 'unavailable', flush=True)
        return result.returncode == 0
    except (OSError, UnicodeError, subprocess.TimeoutExpired) as exc:
        print('REPORT HANDOFF FAIL:', exc, flush=True)
        return False


def start(mode):
    CACHE.mkdir(parents=True, exist_ok=True)
    lock = os.open(CACHE / 'verify.lock', os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock)
        raise RuntimeError('Another verification is already running; use khata status')
    existing = read_json(CACHE / 'state.json')
    if existing.get('status') == 'RUNNING' and is_alive(existing.get('pid')):
        os.close(lock)
        raise RuntimeError('A verification is running; no overlapping run')
    baseline()
    names = safe_files()
    source = fingerprint(names)
    before = git('status', '--porcelain=v1', '-z', '--untracked-files=all')
    report_path = downloads() / REPORT_NAME
    # No automatic rerun. Resume is an explicit user action.
    if mode == 'resume':
        cp = read_json(CACHE / 'checkpoint.json')
        if cp.get('fingerprint') != source:
            print('NOTICE: source changed; previous checkpoints invalidated, full run needed.')
    run_id = time.strftime('%Y%m%d-%H%M%S') + '-' + str(os.getpid())
    state = {'id': run_id, 'status': 'RUNNING', 'stage': 'starting', 'fingerprint': source, 'pid': 0}
    atomic(CACHE / 'state.json', json.dumps(state))
    run_dir = CACHE / 'runs' / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    log = (run_dir / 'console.log').open('w', encoding='utf-8')
    process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '__worker', mode, run_id, str(lock)],
                               stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                               start_new_session=True, pass_fds=(lock,), cwd=ROOT)
    # Worker owns PID/state; avoid race.
    log.close()
    os.close(lock)
    print('STARTED, NOT CERTIFIED. Run ID:', run_id)
    previous = None
    while True:
        try:
            rc = process.wait(timeout=5)
            break
        except subprocess.TimeoutExpired:
            s = read_json(CACHE / 'state.json')
            if s.get('id') != run_id: return 1
            now = (s.get('status'), s.get('stage'))
            if now != previous:
                print('PROGRESS:', *now, flush=True)
                previous = now
        except KeyboardInterrupt:
            print('Worker continues; use khata status.', flush=True)
            return 130
    s = read_json(CACHE / 'state.json')
    try:
        lines = report_path.read_text().splitlines()
        intact = (fingerprint(safe_files()) == source and
                  git('status', '--porcelain=v1', '-z', '--untracked-files=all') == before)
    except Exception as exc:
        print('INTEGRITY ERROR:', exc, flush=True)
        lines, intact = [], False
    passed = intact and final_ok(run_id, rc, s, lines, source, process.pid)
    print('FINAL:', 'PASS' if passed else 'FAIL', 'exit:', rc, 'REPORT:', report_path, flush=True)
    shared = share_report(report_path, run_id)
    return 0 if passed and shared else 1


def android_preflight(environ=None):
    env = os.environ if environ is None else environ
    for key in ('VITE_KHATA_DEMO', 'VITE_KHATA_GUEST_UI', 'VITE_KHATA_PREVIEW'):
        if env.get(key) not in (None, '', 'false'):
            raise RuntimeError('Android build rejects demo/guest/preview modes')
    for key in ('VITE_ORBIS_CUSTOMER_API_URL', 'VITE_KHATA_DATA_URL'):
        value = env.get(key, '')
        url = urlparse(value)
        if (url.scheme != 'https' or not url.hostname or url.hostname in ('localhost', '127.0.0.1')
                or url.username or url.password or url.query or url.fragment):
            raise RuntimeError('Missing/invalid public HTTPS build variable: ' + key)
    config = json.loads((ROOT / 'capacitor.config.json').read_text())
    if (config.get('appId') != 'com.orbisaideveloper.khata' or config.get('webDir') != 'dist'
            or config.get('server') != {'hostname': 'localhost', 'androidScheme': 'https', 'cleartext': False}):
        raise RuntimeError('Android app identity/local-content configuration changed; review first')


@contextlib.contextmanager
def android_signing_material(release):
    encoded = os.environ.get('KHATA_UPLOAD_KEYSTORE_BASE64') if release else None
    if not encoded:
        yield
        return
    previous = os.environ.get('KHATA_UPLOAD_STORE_FILE')
    with tempfile.TemporaryDirectory(prefix='khata-signing-') as directory:
        key = Path(directory) / 'upload.p12'
        try:
            try:
                raw = base64.b64decode(encoded, validate=True)
            except ValueError:
                raise RuntimeError('Invalid upload keystore encoding') from None
            if not raw or len(raw) > 32768:
                raise RuntimeError('Invalid upload keystore size')
            with key.open('xb') as output:
                os.chmod(key, 0o600)
                output.write(raw)
            os.environ['KHATA_UPLOAD_STORE_FILE'] = str(key)
            yield
        finally:
            if previous is None:
                os.environ.pop('KHATA_UPLOAD_STORE_FILE', None)
            else:
                os.environ['KHATA_UPLOAD_STORE_FILE'] = previous


ANDROID_UPLOAD_CERT = '64899AF7336772B762E6A5177A077E7193741F0B532EB395499C7F705205091D'
BUNDLETOOL_SHA = '378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584'


def android_bundle_manifest(xml, version_code, version_name):
    root = ET.fromstring(xml)
    ns = '{http://schemas.android.com/apk/res/android}'
    app = root.find('application')
    if (root.get('package') != 'com.orbisaideveloper.khata'
            or root.get(ns + 'versionCode') != version_code
            or root.get(ns + 'versionName') != version_name
            or app is None or app.get(ns + 'debuggable', 'false') != 'false'
            or app.get(ns + 'allowBackup') != 'false'
            or app.get(ns + 'usesCleartextTraffic') != 'false'):
        raise RuntimeError('Release bundle manifest identity/version/safety mismatch')


def android_verify_bundle():
    bundle = ROOT / 'android/app/build/outputs/bundle/release/app-release.aab'
    if not bundle.is_file():
        raise RuntimeError('Release bundle missing')
    signature = cmd(['jarsigner', '-J-Duser.language=en', '-verify', str(bundle)])
    message = signature.stdout + signature.stderr
    if signature.returncode or 'jar verified.' not in message or 'unsigned entries' in message.lower():
        raise RuntimeError('Release bundle signature verification failed')
    cert = cmd(['keytool', '-J-Duser.language=en', '-printcert', '-jarfile', str(bundle)])
    actual = re.findall(r'SHA256:\s*([0-9A-Fa-f:]+)', cert.stdout)
    if cert.returncode or {value.replace(':', '').upper() for value in actual} != {ANDROID_UPLOAD_CERT}:
        raise RuntimeError('Release bundle signer does not match owner upload certificate')
    tool = CACHE / 'bundletool-all-1.18.2.jar'
    if not tool.is_file() or hashlib.sha256(tool.read_bytes()).hexdigest() != BUNDLETOOL_SHA:
        with urlopen('https://github.com/google/bundletool/releases/download/1.18.2/bundletool-all-1.18.2.jar', timeout=60) as response:
            raw = response.read(40000001)
        if hashlib.sha256(raw).hexdigest() != BUNDLETOOL_SHA:
            raise RuntimeError('Bundletool download checksum mismatch')
        tool.write_bytes(raw)
    for args in (['validate', '--bundle=' + str(bundle)], ['dump', 'manifest', '--bundle=' + str(bundle)]):
        result = cmd(['java', '-jar', str(tool), *args])
        if result.returncode:
            raise RuntimeError('Bundletool ' + args[0] + ' failed')
    android_bundle_manifest(result.stdout, os.environ['KHATA_ANDROID_VERSION_CODE'],
                            os.environ['KHATA_ANDROID_VERSION_NAME'])
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    print('SIGNED AAB VERIFIED: package/version/safety, signature, owner certificate; SHA256=' + digest)
    return digest


def android_build(release=False, device=False):
    baseline()
    android_preflight()
    source = fingerprint(safe_files())
    before = git('status', '--porcelain=v1', '-z', '--untracked-files=all')
    java = cmd(['java', '-version'])
    match = re.search(r'version "(\d+)', java.stderr + java.stdout)
    if java.returncode or not match or int(match.group(1)) < 21:
        raise RuntimeError('ENV BLOCKED: Android needs JDK 21 or newer')
    sdk = Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or '/nonexistent')
    if not (sdk / 'platforms/android-36/android.jar').is_file():
        raise RuntimeError('ENV BLOCKED: Android SDK platform 36 unavailable')
    if release:
        required = ('KHATA_UPLOAD_STORE_FILE', 'KHATA_UPLOAD_STORE_PASSWORD', 'KHATA_UPLOAD_KEY_ALIAS',
                    'KHATA_UPLOAD_KEY_PASSWORD', 'KHATA_ANDROID_VERSION_CODE', 'KHATA_ANDROID_VERSION_NAME')
        if any(not os.environ.get(key) for key in required):
            raise RuntimeError('Release blocked: owner signing/version environment required')
    tasks = ['lintRelease' if release else 'lintDebug', 'testDebugUnitTest',
             'bundleRelease' if release else 'assembleDebug']
    if device:
        tasks.append(':app:connectedDebugAndroidTest')
    steps = [(['npm', 'run', 'build'], ROOT), (['npx', '--no-install', 'cap', 'sync', 'android'], ROOT),
             (['./gradlew', '--no-daemon', *tasks], ROOT / 'android')]
    for args, cwd in steps:
        print('ANDROID:', ' '.join(args), flush=True)
        process = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            print(line, end='', flush=True)
        if process.wait():
            raise RuntimeError('Android build step failed: ' + args[0])
    if fingerprint(safe_files()) != source or git('status', '--porcelain=v1', '-z', '--untracked-files=all') != before:
        raise RuntimeError('Android build changed tracked/reviewable source; inspect and repeat targeted build')
    if release:
        android_verify_bundle()
    print('Android compilation PASS; instrumentation:', 'PASS' if device else 'NOT RUN')
    print('Physical phone, backend, Play approval and full certification NOT VERIFIED')


def android_job(release=False, device=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    with (CACHE / 'verify.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another verification/build is already running')
        report = downloads() / REPORT_NAME
        run_id = 'android-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
        log_path = CACHE / (run_id + '.log')
        if report.is_file():
            shutil.copy2(report, CACHE / (run_id + '-previous-report.txt'))
        print('RUN:', run_id, '| targeted Android build, not final certification', flush=True)
        # Stream output while retaining one private log; final report is atomic.
        import contextlib
        class Output:
            def __init__(self, console, log):
                self.console, self.log = console, log
            def write(self, value):
                self.console.write(value)
                self.log.write(value)
            def flush(self):
                self.console.flush()
                self.log.flush()
        result, error = 'FAIL', ''
        try:
            with log_path.open('w') as log, contextlib.redirect_stdout(Output(sys.stdout, log)), android_signing_material(release):
                android_build(release, device)
            result = 'PASS'
        except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
            error = str(exc)
        finally:
            atomic(report, '\n'.join([
                'ORBIS KHATA — TARGETED ANDROID BUILD', 'Run ID: ' + run_id,
                'UTC: ' + time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'HEAD: ' + git('rev-parse', 'HEAD'),
                'Source fingerprint: ' + fingerprint(safe_files()),
                'Compilation and required release checks: ' + result, 'Error: ' + (error or 'none'),
                'Instrumentation: ' + ('PASS' if device and result == 'PASS' else 'NOT VERIFIED'),
                'Signed AAB: ' + ('PASS (signature/certificate/manifest)' if release and result == 'PASS' else 'NOT VERIFIED'),
                'Native device / backend / Play publication: NOT VERIFIED',
                'Full certification: NOT RUN', 'Git writes / deployment / DB writes: NONE',
                'Private log: ' + str(log_path), 'FINAL: ' + result, '',
            ]))
            print('REPORT:', report, '| FINAL:', result, flush=True)
        if result != 'PASS':
            raise RuntimeError(error)


def main():
    if len(sys.argv) < 2:
        raise RuntimeError('Usage: khata doctor|test|preview|verify|status|resume')
    action = sys.argv[1]
    if action == 'status':
        status()
    elif action == 'doctor':
        doctor()
    elif action == 'test':
        if sys.argv[2:] in (['android'], ['android-release'], ['android-device']):
            android_job(sys.argv[2] == 'android-release', sys.argv[2] == 'android-device')
            return
        baseline()
        tests = sys.argv[2:] or ['src/App.test.tsx', 'src/WorkspaceMenu.test.tsx', 'src/auth', 'src/accounting', 'src/inventory']
        if any(t.startswith('-') or '..' in Path(t).parts for t in tests):
            raise RuntimeError('Pass explicit test file paths only')
        sys.exit(subprocess.run(['npm', 'test', '--', *tests], cwd=ROOT).returncode)
    elif action == 'preview':
        baseline()
        sys.exit(subprocess.run(['npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], cwd=ROOT).returncode)
    elif action in ('verify', 'resume'):
        sys.exit(start(action))
    elif action == '__worker':
        sys.exit(worker(sys.argv[2], sys.argv[3], int(sys.argv[4])))
    else:
        raise RuntimeError('Unknown action: ' + action)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as err:
        print('STOP:', str(err), file=sys.stderr)
        if len(sys.argv) > 1 and sys.argv[1] in ('verify', 'resume'):
            try:
                path = downloads() / REPORT_NAME
                if path.is_file():
                    shutil.copy2(path, CACHE / 'previous-final-report.txt')
                atomic(path, 'ORBIS KHATA — VERIFICATION STARTUP\nCAUSE: ' + str(err) +
                       '\nNo gates were certified. Git writes/deploy: NONE\nFINAL: FAIL\n')
                print('FINAL: FAIL | REPORT:', path, file=sys.stderr)
            except Exception as report_error:
                print('REPORT UNAVAILABLE:', report_error, file=sys.stderr)
        sys.exit(1)
