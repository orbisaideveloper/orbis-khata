"""Use ELF fixtures with real build IDs and stripped/separate symbols."""
import runpy
import subprocess
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

inspect = runpy.run_path(str(Path(__file__).with_name("khata-native-symbols.py")))["inspect"]
LIBRARY = "base/lib/x86_64/libfixture.so"
SYMBOL = "x86_64/libfixture.so.dbg"
EMBEDDED = "BUNDLE-METADATA/com.android.tools.build.debugsymbols/" + SYMBOL


class NativeSymbolsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(temp.cleanup)
        cls.root = Path(temp.name)
        cls.stripped = cls.root / "stripped.so"
        cls.debug = cls.root / "debug.elf"
        cls.other = cls.root / "other.so"
        for name, value in [("same", 1), ("other", 2)]:
            source = cls.root / f"{name}.c"
            source.write_text(f"int fixture(void) {{ return {value}; }}\n")
            subprocess.run(["cc", "-m64", "-g", "-shared", "-fPIC", "-Wl,--build-id=sha1",
                            source, "-o", cls.root / f"{name}.so"], check=True)
        subprocess.run(["objcopy", "--only-keep-debug", cls.root / "same.so", cls.debug], check=True)
        subprocess.run(["objcopy", "--strip-all", cls.root / "same.so", cls.stripped], check=True)

    def archive(self, name, entries):
        path = self.root / name
        with ZipFile(path, "w") as archive:
            for key, file in entries:
                archive.write(file, key)
        return path

    def test_missing_is_diagnostic_and_sqlcipher_coverage_is_required_in_ci(self):
        bundle = self.archive("a.aab", [(LIBRARY, self.stripped)])
        result = inspect(bundle, None)
        self.assertEqual((result["status"], result["covered"], result["total"]), ("MISSING", 0, 1))
        with self.assertRaisesRegex(ValueError, "expected base SQLCipher ABI"):
            inspect(bundle, None, True)

    def test_embedded_and_external_match_and_partial_reports_counts(self):
        bundle = self.archive("b.aab", [(LIBRARY, self.stripped), (EMBEDDED, self.debug),
                                       ("base/lib/x86_64/libother.so", self.other)])
        result = inspect(bundle, None)
        self.assertEqual((result["status"], result["covered"]), ("PARTIAL", 1))
        bundle = self.archive("c.aab", [(LIBRARY, self.stripped)])
        symbols = self.archive("symbols.zip", [(SYMBOL, self.debug)])
        self.assertEqual(inspect(bundle, symbols)["status"], "MATCHED")

    def test_wrong_build_id_and_stripped_symbol_rejected(self):
        for wrong in (self.other, self.stripped):
            with self.subTest(wrong=wrong):
                bundle = self.archive("d.aab", [(LIBRARY, self.stripped), (EMBEDDED, wrong)])
                with self.assertRaisesRegex(ValueError, "mismatched or stripped"):
                    inspect(bundle, None)

    def test_wrong_abi_and_ambiguous_module_mapping_rejected(self):
        bundle = self.archive("e.aab", [(LIBRARY.replace("x86_64", "arm64-v8a"), self.stripped)])
        with self.assertRaisesRegex(ValueError, "machine/class"):
            inspect(bundle, None)
        bundle = self.archive("f.aab", [(LIBRARY, self.stripped), (EMBEDDED, self.debug),
                                       (LIBRARY.replace("base", "feature"), self.stripped)])
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            inspect(bundle, None)


if __name__ == "__main__":
    unittest.main()
