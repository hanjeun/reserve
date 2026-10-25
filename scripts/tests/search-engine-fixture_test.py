import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('engine_comparison', Path(__file__).resolve().parents[1] / 'compare-search-engines.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class OwnedEngineFixtureTest(unittest.TestCase):
    def engine(self):
        engine = MODULE.Engine.__new__(MODULE.Engine)
        engine.kind, engine.owner, engine.name = 'qdrant', 'this-run', 'reserve-search-qdrant-this-run'
        engine.image, engine.image_existed, engine.id = 'qdrant/qdrant:v1.20.0', False, None
        return engine

    def test_cleanup_does_not_remove_an_image_that_was_never_created(self):
        engine = self.engine()
        with patch.object(MODULE, 'docker', return_value='') as docker, patch.object(MODULE.subprocess, 'run', return_value=SimpleNamespace(returncode=1)):
            engine.close()
        self.assertFalse(any(call.args[0] in ('rm', 'image') for call in docker.call_args_list))

    def test_cleanup_refuses_a_foreign_container(self):
        engine = self.engine(); engine.id = 'a' * 64
        with patch.object(MODULE, 'docker', return_value='another-run') as docker:
            with self.assertRaisesRegex(RuntimeError, 'unowned'):
                engine.close()
        self.assertFalse(any(call.args[0] == 'rm' for call in docker.call_args_list))

    def test_preexisting_images_are_preserved_after_owned_container_cleanup(self):
        engine = self.engine(); engine.id = 'a' * 64; engine.image_existed = True
        with patch.object(MODULE, 'docker', side_effect=lambda *args, **kwargs: engine.owner if args[0] == 'inspect' else '') as docker, patch.object(MODULE.subprocess, 'run', return_value=SimpleNamespace(returncode=0)):
            engine.close()
        self.assertTrue(any(call.args[0] == 'rm' for call in docker.call_args_list))
        self.assertFalse(any(call.args[0] == 'image' for call in docker.call_args_list))

    def test_low_memory_stops_before_starting_a_container(self):
        engine = self.engine()
        with patch.object(MODULE.psutil, 'virtual_memory', return_value=SimpleNamespace(available=1)), patch.object(MODULE.time, 'sleep'), patch.object(MODULE, 'docker') as docker:
            with self.assertRaisesRegex(RuntimeError, '1536MiB'):
                engine.start()
        docker.assert_not_called()

    def test_memory_recovery_between_engines_is_waited_for(self):
        engine = self.engine()
        def docker(*args, **kwargs):
            return 'a' * 64 if args[0] == 'run' else '127.0.0.1:43123'
        with patch.object(MODULE.psutil, 'virtual_memory', side_effect=[SimpleNamespace(available=1), SimpleNamespace(available=2 * 1024 ** 3)]), patch.object(MODULE.time, 'sleep') as sleep, patch.object(MODULE, 'docker', side_effect=docker), patch.object(MODULE, 'request', return_value={}):
            engine.start()
        sleep.assert_called_once_with(0.5)
        self.assertEqual(engine.base, 'http://127.0.0.1:43123')

    def test_remote_docker_endpoints_are_rejected_before_any_input_is_loaded(self):
        with patch.object(MODULE, 'docker', return_value='tcp://remote.example:2375'), patch.object(MODULE.os.sys, 'argv', ['compare-search-engines.py']):
            with self.assertRaisesRegex(RuntimeError, 'default local'):
                MODULE.main()


if __name__ == '__main__':
    unittest.main()
