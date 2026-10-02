import importlib.util
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("positions_export", Path(__file__).parents[1] / "export-alloy-positions.py")
positions_export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(positions_export)


def entry(path, labels, offset):
    return f'  ? path: {path}\n    labels: \'{labels}\'\n  : "{offset}"\n'


class ExportPositionsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="reserve-positions-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for job in positions_export.JOBS:
            directory = self.root / f"loki.source.file.{job}"
            directory.mkdir()
            (directory / "positions.yml").write_text("positions: {}\n", encoding="utf-8")

    def write(self, job, body):
        (self.root / f"loki.source.file.{job}" / "positions.yml").write_text(body, encoding="utf-8")

    def test_current_labeled_offsets_win_over_imported_legacy_offsets(self):
        self.write("reserve", "positions:\n" + entry("/var/log/reserve/app.log", "{}", 12)
                   + entry("/var/log/reserve/app.log", '{job="reserve"}', 34))
        self.assertEqual(positions_export.export_positions(self.root), 'positions:\n  /var/log/reserve/app.log: "34"\n')

    def test_foreign_legacy_entries_do_not_override_their_own_source(self):
        self.write("reserve", "positions:\n" + entry("/var/log/metrics/metrics-old.log", "{}", 12)
                   + entry("/var/log/reserve/app.log", '{job="reserve"}', 34))
        self.write("metrics", "positions:\n" + entry("/var/log/metrics/metrics-old.log", '{job="metrics"}', 56)
                   + entry("/var/log/metrics/metrics-new.log", '{job="metrics"}', 78))
        result = positions_export.export_positions(self.root)
        self.assertIn('/var/log/metrics/metrics-old.log: "56"', result)
        self.assertIn('/var/log/metrics/metrics-new.log: "78"', result)
        self.assertNotIn(': "12"', result)

    def test_unread_owned_file_retains_its_legacy_offset(self):
        self.write("backup", "positions:\n" + entry("/var/log/reserve/backup.log", "{}", 90))
        self.assertIn('/var/log/reserve/backup.log: "90"', positions_export.export_positions(self.root))

    def test_duplicate_path_fails_closed(self):
        self.write("reserve", "positions:\n" + entry("/var/log/reserve/app.log", "{}", 1)
                   + entry("/var/log/reserve/app.log", "{}", 2))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            positions_export.export_positions(self.root)

    def test_unknown_labels_or_source_path_fail_closed(self):
        for path, labels in [("/var/log/reserve/app.log", '{job="backup"}'),
                             ("/var/log/reserve/app.log", '{job="reserve",extra="label"}'),
                             ("/var/log/metrics/../outside.log", "{}"),
                             ("/etc/unreviewed.log", "{}")]:
            with self.subTest(path=path, labels=labels):
                self.write("reserve", "positions:\n" + entry(path, labels, 1))
                with self.assertRaises(ValueError):
                    positions_export.export_positions(self.root)

    def test_unsupported_schema_and_missing_source_fail_closed(self):
        self.write("reserve", "positions:\n  /var/log/reserve/app.log: 1\n")
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            positions_export.export_positions(self.root)
        (self.root / "loki.source.file.reserve" / "positions.yml").unlink()
        with self.assertRaises(FileNotFoundError):
            positions_export.export_positions(self.root)

    def test_empty_state_cannot_rewind_every_file(self):
        with self.assertRaisesRegex(ValueError, "No positions"):
            positions_export.export_positions(self.root)


if __name__ == "__main__":
    unittest.main()
