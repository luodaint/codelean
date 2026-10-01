import unittest
import pathlib
import tempfile
from server import valid_path, scan, write_source

class InputTests(unittest.TestCase):
    def test_paths(self):
        for path in ("../x", "/etc/passwd", "a/../../b", "a\\b", ".git/config", ".semgrepignore", "src/.gitleaksignore"):
            self.assertFalse(valid_path(path), path)
        self.assertTrue(valid_path("src/main.py"))

    def test_empty_scan_is_not_clean(self):
        with self.assertRaises(ValueError):
            scan([])

    def test_duplicate_files(self):
        file = {"path": "test.py", "content": "x=1", "patch": "+x=1"}
        with self.assertRaises(ValueError):
            scan([file, file])

    def test_source_write_stays_inside_private_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            source = root / "source"
            source.mkdir()
            write_source(source, "nested/example.py", "x = 1\n")
            self.assertEqual((source / "nested/example.py").read_text(), "x = 1\n")
            self.assertEqual((source / "nested/example.py").stat().st_mode & 0o777, 0o444)
            for path in ("../outside.py", "../source-sibling/outside.py", str(root / "absolute.py")):
                with self.assertRaises(ValueError):
                    write_source(source, path, "must not be written")
            self.assertFalse((root / "outside.py").exists())
            self.assertFalse((root / "source-sibling").exists())
            self.assertFalse((root / "absolute.py").exists())

    def test_source_write_rejects_symlink_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            source = root / "source"
            outside = root / "source-sibling"
            source.mkdir()
            outside.mkdir()
            (source / "link").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                write_source(source, "link/escaped.py", "must not be written")
            self.assertFalse((outside / "escaped.py").exists())

if __name__ == "__main__":
    unittest.main()
