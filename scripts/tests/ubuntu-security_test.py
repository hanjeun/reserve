import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, mock_open, patch


SPEC = importlib.util.spec_from_file_location("ubuntu_security", Path(__file__).resolve().parents[1] / "inspect-ubuntu-security.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class UbuntuSecurityInspectionTest(unittest.TestCase):
    def test_non_linux_stops_before_any_file_or_command(self):
        with patch.object(MODULE.sys, "platform", "win32"), patch.object(MODULE.Path, "open") as opened, patch.object(MODULE.subprocess, "run") as command:
            self.assertEqual(MODULE.collect(), {"status": "UNKNOWN", "reason": "ubuntu_linux_required"})
        opened.assert_not_called()
        command.assert_not_called()

    def test_non_ubuntu_stops_before_package_or_kernel_inspection(self):
        with patch.object(MODULE.sys, "platform", "linux"), patch.object(MODULE.Path, "open", mock_open(read_data='ID=debian\nVERSION_ID="12"\n')), patch.object(MODULE.subprocess, "run") as command, patch.object(MODULE.platform, "release") as kernel:
            self.assertEqual(MODULE.collect()["os"]["reason"], "ubuntu_required")
        command.assert_not_called()
        kernel.assert_not_called()

    def test_os_release_emits_only_selected_fields(self):
        with patch.object(MODULE.Path, "open", mock_open(read_data='ID=ubuntu\nVERSION_ID="24.04"\nPRIVATE_DATA=do-not-output\n')):
            self.assertEqual(MODULE.os_release(), {"status": "OBSERVED", "id": "ubuntu", "version_id": "24.04"})
        with patch.object(MODULE.Path, "open", side_effect=PermissionError("sensitive diagnostic")):
            self.assertEqual(MODULE.os_release(), {"status": "UNKNOWN", "reason": "os_release_unreadable"})

    def test_package_collection_uses_only_fixed_bounded_command_and_allowlist(self):
        output = "libc6:amd64\t2.39-0ubuntu8.6\tinstalled\nprivate-app\t1.0\tinstalled\nlinux-image-6.8.0-88-generic\t6.8.0-88.89\tinstalled\nnginx\t1.24.0\tconfig-files\n"
        with patch.object(MODULE.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=output)) as command:
            result = MODULE.packages()
        self.assertEqual([item["name"] for item in result["items"]], ["libc6:amd64", "linux-image-6.8.0-88-generic"])
        self.assertEqual(command.call_args.args, (MODULE.DPKG_COMMAND,))
        self.assertEqual(command.call_args.kwargs["timeout"], 10)
        self.assertNotIn("shell", command.call_args.kwargs)
        self.assertEqual(command.call_args.kwargs["stdin"], MODULE.subprocess.DEVNULL)

    def test_failed_or_empty_package_query_is_unknown_without_error_text(self):
        for output, returncode in (("", 0), ("broken-output", 0), ("secret-stderr", 1)):
            with self.subTest(output=output), patch.object(MODULE.subprocess, "run", return_value=SimpleNamespace(returncode=returncode, stdout=output)):
                result = MODULE.packages()
                self.assertEqual(result["status"], "UNKNOWN")
                self.assertNotIn("items", result)
                self.assertNotIn("secret-stderr", json.dumps(result))
        with patch.object(MODULE.subprocess, "run", side_effect=MODULE.subprocess.TimeoutExpired("sensitive command", 10)):
            self.assertEqual(MODULE.packages(), {"status": "UNKNOWN", "reason": "dpkg_query_unavailable"})

    def test_reboot_marker_absent_and_unreadable_are_distinct(self):
        with patch.object(MODULE.Path, "stat", side_effect=FileNotFoundError):
            self.assertEqual(MODULE.reboot_required(), {"status": "OBSERVED", "marker_present": False})
        with patch.object(MODULE.Path, "stat", side_effect=PermissionError):
            self.assertEqual(MODULE.reboot_required()["status"], "UNKNOWN")
        with patch.object(MODULE.Path, "stat", return_value=SimpleNamespace(st_mtime=100)):
            self.assertTrue(MODULE.reboot_required()["marker_present"])

    def test_cache_reports_timestamps_without_repository_names(self):
        release = Mock()
        release.name = "private-repository.example_ubuntu_dists_noble_InRelease"
        release.is_file.return_value = True
        release.stat.return_value = SimpleNamespace(st_mtime=100)
        with patch.object(MODULE.Path, "stat", return_value=SimpleNamespace(st_mtime=200)), patch.object(MODULE.Path, "iterdir", return_value=iter([release])):
            result = MODULE.apt_cache()
        self.assertEqual(result["release_metadata"]["file_count"], 1)
        self.assertEqual(result["release_metadata"]["oldest_mtime_utc"], MODULE.utc(100))
        self.assertNotIn("private-repository", json.dumps(result))

    def test_unreadable_cache_is_unknown_not_zero_updates(self):
        with patch.object(MODULE.Path, "stat", side_effect=FileNotFoundError), patch.object(MODULE.Path, "iterdir", side_effect=PermissionError):
            result = MODULE.apt_cache()
        self.assertEqual(result["update_success_stamp"]["status"], "UNKNOWN")
        self.assertEqual(result["update_success_stamp"]["reason"], "update_success_stamp_absent")
        self.assertEqual(result["release_metadata"]["status"], "UNKNOWN")
        self.assertNotIn("file_count", result["release_metadata"])

    def test_observation_never_claims_cve_status_or_patch_completeness(self):
        observed = {"status": "OBSERVED"}
        with patch.object(MODULE.sys, "platform", "linux"), patch.object(MODULE, "os_release", return_value={**observed, "id": "ubuntu", "version_id": "24.04"}), patch.object(MODULE.platform, "release", return_value="6.8.0-88-generic"), patch.object(MODULE, "packages", return_value=MODULE.unknown("dpkg_query_failed")), patch.object(MODULE, "reboot_required", return_value={**observed, "marker_present": False}), patch.object(MODULE, "apt_cache", return_value={}):
            result = MODULE.collect()
        self.assertEqual(result["scope"], "local_metadata_only")
        self.assertEqual(result["cve_assessment"], "UNKNOWN")
        self.assertEqual(result["packages"]["status"], "UNKNOWN")
        self.assertEqual(result["status"], "PARTIAL")
        self.assertNotIn("hostname", result)

    def test_arguments_cannot_select_a_command_or_path(self):
        with patch.object(MODULE.sys, "argv", ["inspect-ubuntu-security.py", "--command=anything"]), patch.object(MODULE, "collect") as collect, patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertEqual(MODULE.main(), 2)
            self.assertEqual(json.loads(output.getvalue())["reason"], "arguments_not_supported")
        collect.assert_not_called()

    def test_unavailable_kernel_remains_unknown_without_exception_text(self):
        with patch.object(MODULE.sys, "platform", "linux"), patch.object(MODULE, "os_release", return_value={"status": "OBSERVED"}), patch.object(MODULE.platform, "release", side_effect=OSError("private diagnostic")), patch.object(MODULE, "packages", return_value={}), patch.object(MODULE, "reboot_required", return_value={}), patch.object(MODULE, "apt_cache", return_value={}):
            result = MODULE.collect()
        self.assertEqual(result["running_kernel"]["status"], "UNKNOWN")
        self.assertEqual(result["status"], "PARTIAL")
        self.assertNotIn("private diagnostic", json.dumps(result))

    def collect_fixture(self, package=None, reboot=None, cache=None):
        observed = {"status": "OBSERVED"}
        with patch.object(MODULE.sys, "platform", "linux"), patch.object(MODULE, "os_release", return_value={**observed, "id": "ubuntu", "version_id": "24.04"}), patch.object(MODULE.platform, "release", return_value="6.8.0-88-generic"), patch.object(MODULE, "packages", return_value=package or observed), patch.object(MODULE, "reboot_required", return_value=reboot or observed), patch.object(MODULE, "apt_cache", return_value=cache or {"update_success_stamp": observed, "release_metadata": observed}):
            return MODULE.collect()

    def test_required_observation_failures_mark_entire_collection_partial(self):
        unknown = MODULE.unknown("synthetic_failure")
        for fields in ({"package": unknown}, {"reboot": unknown},
                       {"cache": {"update_success_stamp": {"status": "OBSERVED"}, "release_metadata": unknown}}):
            with self.subTest(fields=fields):
                self.assertEqual(self.collect_fixture(**fields)["status"], "PARTIAL")

    def test_optional_stamp_absence_does_not_hide_required_cache_observations(self):
        absent_stamp = MODULE.unknown("update_success_stamp_absent")
        result = self.collect_fixture(cache={"update_success_stamp": absent_stamp, "release_metadata": {"status": "OBSERVED"}})
        self.assertEqual(result["status"], "OBSERVED")
        self.assertEqual(result["cve_assessment"], "UNKNOWN")
        self.assertEqual(result["apt_cache"]["update_success_stamp"]["status"], "UNKNOWN")
        result = self.collect_fixture(cache={"update_success_stamp": absent_stamp, "release_metadata": MODULE.unknown("release_metadata_unavailable")})
        self.assertEqual(result["status"], "PARTIAL")

    def test_optional_stamp_read_error_is_partial_unlike_absence(self):
        result = self.collect_fixture(cache={"update_success_stamp": MODULE.unknown("update_success_stamp_unavailable"),
                                             "release_metadata": {"status": "OBSERVED"}})
        self.assertEqual(result["status"], "PARTIAL")

    def test_main_returns_nonzero_for_unknown_and_partial_collection(self):
        for status, expected in (("OBSERVED", 0), ("PARTIAL", 2), ("UNKNOWN", 2)):
            with self.subTest(status=status), patch.object(MODULE.sys, "argv", ["inspect-ubuntu-security.py"]), patch.object(MODULE, "collect", return_value={"status": status}), patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(MODULE.main(), expected)


if __name__ == "__main__":
    unittest.main()
