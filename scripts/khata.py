#!/usr/bin/env python3
"""ORBIS Khata: one report, exact local source, guarded resumable quality runner."""
from __future__ import annotations
import fcntl
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
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path.home() / '.cache/orbis-khata-quality'
REPORT_NAME = 'ORBIS-KHATA-LATEST-REPORT.txt'
EXPECTED_REMOTE = 'orbisaideveloper/orbis-khata'
APPROVED_UNTRACKED = {'docs/UI_PHASE_01.md', 'docs/UI_PHASE_02.md', 'docs/UI_PHASE_03.md',
                      'docs/UI_PHASE_04.md', 'src/i18n.ts', 'scripts/khata.py', 'scripts/khata-selftest.py'}
STAGES = ['ubuntu-preflight', 'knip', 'jscpd', 'playwright', 'npm-ls', 'npm-audit',
          'lint', 'typecheck', 'build', 'coverage']


def cmd(args, cwd=ROOT, capture=True, **kwargs):
    return subprocess.run(args, cwd=cwd, text=True, capture_output=capture, **kwargs)


def git(*args):
    result = cmd(['git', *args])
    if result.returncode:
        raise RuntimeError('git ' + ' '.join(args) + ': ' + (result.stderr or result.stdout).strip())
    return result.stdout.strip()


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
    res = cmd(['proot-distro', 'login', 'ubuntu', '--', 'bash', '-lc', 'node --version && npm --version'])
    versions.append(res.stdout.strip() if res.returncode == 0 else 'UNAVAILABLE')
    return versions


def baseline():
    if ROOT.name != 'orbis-khata' or not (ROOT / '.git').exists():
        raise RuntimeError('Wrong repository root: ' + str(ROOT))
    branch = git('branch', '--show-current')
    head = git('rev-parse', 'HEAD')
    remote = git('remote', 'get-url', 'origin')
    if branch != 'main' or not (remote == 'https://github.com/' + EXPECTED_REMOTE + '.git'
                                or remote == 'git@github.com:' + EXPECTED_REMOTE + '.git'):
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
    arg = ['proot-distro', 'login', 'ubuntu', '--', 'bash', '-lc', script]
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
            report.append('ERROR EXCERPT:\n' + '\n'.join(content.splitlines()[-45:]))
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
node -e "const {{chromium}}=require('@playwright/test'); chromium.launch().then(b=>{{console.log('BROWSER_VERSION='+b.version());return b.close()}}).catch(e=>{{console.error(e);process.exit(1)}})" || {{
  ./node_modules/.bin/playwright install chromium --only-shell
  node -e "const {{chromium}}=require('@playwright/test'); chromium.launch().then(b=>{{console.log('BROWSER_VERSION='+b.version());return b.close()}}).catch(e=>{{console.error(e);process.exit(1)}})"
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
                           'build': ['npm', 'run', 'build'], 'coverage': ['npm', 'run', 'test:coverage']}
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
    state['pid'] = process.pid
    atomic(CACHE / 'state.json', json.dumps(state))
    log.close()
    os.close(lock)
    print('STARTED, NOT CERTIFIED. Run ID:', run_id)
    print('Progress is read-only via: khata status. No final PASS until worker finishes.')
    print('ONLY final report (created after completion):', downloads() / REPORT_NAME)


def main():
    if len(sys.argv) < 2:
        raise RuntimeError('Usage: khata doctor|test|preview|verify|status|resume')
    action = sys.argv[1]
    if action == 'status':
        status()
    elif action == 'doctor':
        doctor()
    elif action == 'test':
        baseline()
        tests = sys.argv[2:] or ['src/App.test.tsx']
        if any(t.startswith('-') or '..' in Path(t).parts for t in tests):
            raise RuntimeError('Pass explicit test file paths only')
        sys.exit(subprocess.run(['npm', 'test', '--', *tests], cwd=ROOT).returncode)
    elif action == 'preview':
        baseline()
        sys.exit(subprocess.run(['npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], cwd=ROOT).returncode)
    elif action in ('verify', 'resume'):
        start(action)
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
