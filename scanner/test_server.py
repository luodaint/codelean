import unittest
from server import valid_path, scan

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

if __name__ == "__main__":
    unittest.main()
