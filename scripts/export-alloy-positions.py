#!/usr/bin/env python3
"""Export this project's Alloy 1.20.1 file positions for a stopped Promtail rollback.

Read-only: emits YAML on stdout. Both collectors must be stopped before the
operator installs the result. Never replace the preserved cutover snapshot.
"""

import argparse
from pathlib import Path
import re
import sys


JOBS = {
    "reserve": re.compile(r"/var/log/reserve/app\.log"),
    "backup": re.compile(r"/var/log/reserve/backup\.log"),
    "metrics": re.compile(r"/var/log/metrics/[A-Za-z0-9_.-]+\.log"),
    "nginx": re.compile(r"/var/log/reserve-nginx/[A-Za-z0-9_.-]+-json\.log"),
}
ENTRY = re.compile(r"  \? path: ([^\r\n]+)\n    labels: '([^\r\n]*)'\n  : \"([0-9]+)\"\n")


def export_positions(storage_path):
    root = Path(storage_path).resolve(strict=True)
    result = {}
    for job, path_pattern in JOBS.items():
        directory = root / f"loki.source.file.{job}"
        source = directory / "positions.yml"
        if directory.is_symlink() or source.is_symlink() or not source.resolve(strict=True).is_relative_to(root):
            raise ValueError("Position file must stay inside the Alloy storage directory")
        if source.stat().st_size > 1024 * 1024:
            raise ValueError("Position file exceeds the reviewed size limit")
        document = source.read_text(encoding="utf-8")
        if document == "positions: {}\n":
            continue
        if not document.startswith("positions:\n"):
            raise ValueError("Unsupported Alloy positions header")
        entries = document[len("positions:\n"):]
        cursor = 0
        legacy = {}
        labeled = {}
        while cursor < len(entries):
            match = ENTRY.match(entries, cursor)
            if not match:
                raise ValueError("Unsupported Alloy positions entry; review before rollback")
            path, labels, offset = match.groups()
            cursor = match.end()
            if not any(pattern.fullmatch(path) for pattern in JOBS.values()):
                raise ValueError("Position path is outside the four reviewed log sources")
            if labels not in ("{}", '{job="' + job + '"}'):
                raise ValueError("Unexpected source labels; review before rollback")
            if not path_pattern.fullmatch(path):
                if labels != "{}":
                    raise ValueError("Job label does not match its log path")
                continue
            destination = legacy if labels == "{}" else labeled
            if path in destination:
                raise ValueError("Duplicate position entry; review before rollback")
            destination[path] = int(offset)
        for path, offset in (legacy | labeled).items():
            if path in result:
                raise ValueError("Multiple sources own the same log path")
            result[path] = offset
    if not result:
        raise ValueError("No positions found; refusing a replay from the beginning")
    return "positions:\n" + "".join(f'  {path}: "{offset}"\n' for path, offset in sorted(result.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("storage_path", help="stopped Alloy's persistent storage directory")
    args = parser.parse_args()
    try:
        output = export_positions(args.storage_path)
    except (OSError, ValueError) as error:
        print(f"Refusing rollback export: {error}", file=sys.stderr)
        return 1
    sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
