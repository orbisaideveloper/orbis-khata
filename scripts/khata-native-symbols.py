"""Inventory native debug symbols for an already verified Android bundle."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
from collections import Counter
from pathlib import Path
from zipfile import BadZipFile, ZipFile

ABI = {
    "arm64-v8a": (64, "AArch64"),
    "armeabi-v7a": (32, "ARM"),
    "x86": (32, "Intel 80386"),
    "x86_64": (64, "Advanced Micro Devices X86-64"),
}
LIBRARY = re.compile(r"([\w.-]+)/lib/([\w-]+)/(lib[\w.+-]+\.so)", re.ASCII)
SYMBOL = r"([\w-]+)/(lib[\w.+-]+\.so)(?:\.(?:sym|dbg))?"
EMBEDDED = re.compile(r"BUNDLE-METADATA/com\.android\.tools\.build\.debugsymbols/" + SYMBOL, re.ASCII)
EXTERNAL = re.compile(SYMBOL, re.ASCII)
MAX_ELF_BYTES = 128 * 1024 * 1024


def elf(archive, entry, abi, scratch):
    with archive.open(entry) as stream:
        data = stream.read(MAX_ELF_BYTES + 1)
    if len(data) > MAX_ELF_BYTES:
        raise ValueError("ELF exceeds inspection limit")
    scratch.write_bytes(data)
    result = subprocess.run(
        ["readelf", "-W", "-h", "-n", "-s", str(scratch)],
        capture_output=True, text=True, timeout=30,
        env={**os.environ, "LC_ALL": "C"},
    )
    if result.returncode:
        raise ValueError("readelf could not parse ELF")
    output = result.stdout
    machine = re.search(r"^\s*Machine:\s*(.+)$", output, re.M)
    elf_class = re.search(r"^\s*Class:\s+ELF(32|64)$", output, re.M)
    build_ids = re.findall(r"Build ID: ([0-9a-f]+)\s*$", output, re.M)
    if (abi not in ABI or not machine or not elf_class
            or (int(elf_class[1]), machine[1].strip()) != ABI[abi]):
        raise ValueError("ELF machine/class does not match ABI")
    if len(build_ids) != 1 or len(build_ids[0]) % 2 or not int(build_ids[0], 16):
        raise ValueError("ELF must contain one valid GNU Build ID")
    static_table = output.partition("Symbol table '.symtab'")[2].partition("\nSymbol table ")[0]
    functions = any(
        re.match(r"\s*\d+:\s+[0-9a-f]+\s+\d+\s+FUNC\s+\S+\s+\S+\s+\d+\s+\S", line)
        for line in static_table.splitlines()
    )
    return {"build_id": build_ids[0], "sha256": hashlib.sha256(data).hexdigest(),
            "has_static_functions": functions}


def inspect(bundle, symbols, require_sqlcipher=False):
    with ZipFile(bundle) as aab:
        entries = aab.namelist()
        libraries = [(name, match.groups()) for name in entries if (match := LIBRARY.fullmatch(name))]
        if any(re.match(r"[^/]+/lib/.*\.so$", name) and not LIBRARY.fullmatch(name)
               for name in entries):
            raise ValueError("unexpected native library path")
        if require_sqlcipher:
            expected = {("base", abi, "libsqlcipher.so") for abi in ABI}
            if not expected.issubset({key for _, key in libraries}):
                raise ValueError("AAB is missing an expected base SQLCipher ABI")
        candidates = {}
        key_counts = Counter(key[1:] for _, key in libraries)
        with tempfile.TemporaryDirectory() as folder:
            elf_path = Path(folder) / "inspection.elf"
            for archive_path, pattern in [(bundle, EMBEDDED), (symbols, EXTERNAL)]:
                if archive_path is None:
                    continue
                with ZipFile(archive_path) as source:
                    for member in source.namelist():
                        match = pattern.fullmatch(member)
                        if not match:
                            if not member.endswith("/") and (
                                pattern is EXTERNAL or member.startswith(
                                    "BUNDLE-METADATA/com.android.tools.build.debugsymbols/")):
                                raise ValueError(f"unexpected symbol archive entry: {member}")
                            continue
                        key = match.groups()
                        origin = "embedded" if pattern is EMBEDDED else "external"
                        if (key_counts[key] != 1
                                or any(item["source"] == origin for item in candidates.get(key, []))):
                            raise ValueError(f"ambiguous, duplicate or orphan symbol entry: {member}")
                        candidate = elf(source, member, key[0], elf_path)
                        candidate.update(source=origin, path=member)
                        candidates.setdefault(key, []).append(candidate)
            rows = []
            for member, (module, abi, name) in sorted(libraries):
                if entries.count(member) != 1:
                    raise ValueError(f"duplicate native library: {member}")
                binary = elf(aab, member, abi, elf_path)
                matches = candidates.get((abi, name), [])
                for candidate in matches:
                    if candidate["build_id"] != binary["build_id"] or not candidate["has_static_functions"]:
                        raise ValueError(f"mismatched or stripped symbols: {candidate['path']}")
                rows.append({"module": module, "abi": abi, "library": name, "path": member,
                             **binary, "symbols": matches})
    covered = sum(bool(row["symbols"]) for row in rows)
    status = "NO_NATIVE_CODE"
    if rows:
        status = "MATCHED" if covered == len(rows) else "PARTIAL" if covered else "MISSING"
    return {"status": status, "covered": covered, "total": len(rows), "libraries": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--symbols", type=Path, help="Optional ABI/lib*.so[.sym|.dbg] ZIP")
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--version-code", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--require-sqlcipher", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_sha):
        parser.error("--source-sha must be a full Git SHA")
    if not re.fullmatch(r"[1-9][0-9]{0,9}", args.version_code):
        parser.error("--version-code must be a positive decimal integer")
    report = {"schema_version": 1, "source_sha": args.source_sha,
              "version_code": args.version_code}
    try:
        with args.bundle.open("rb") as bundle:
            report["aab_sha256"] = hashlib.file_digest(bundle, "sha256").hexdigest()
        report.update(inspect(args.bundle, args.symbols, args.require_sqlcipher))
    except (ValueError, OSError, BadZipFile, subprocess.TimeoutExpired) as error:
        report.update(status="INVALID", error=str(error))
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Native symbols: {report['status']}")
    if "covered" in report:
        print(f"Matching symbols: {report['covered']}/{report['total']} native libraries")
    else:
        print(report["error"])
    return int(report["status"] == "INVALID")


if __name__ == "__main__":
    raise SystemExit(main())
