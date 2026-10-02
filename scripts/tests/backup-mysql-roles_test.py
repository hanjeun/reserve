"""Opt-in native MySQL proof for backup object coverage and separated DB roles.

Creates one labelled, network-isolated disposable container. The backup script
runs unchanged against synthetic data; its AWS upload is explicitly stubbed.
Passwords are generated in memory and passed through stdin/environment only.
"""

import argparse
import gzip
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import uuid


IMAGE = "mysql@sha256:4af1f8815716546f5b12410f7621f37f93db8dd11a184706ef59111930b8c2ff"
DATABASE = "reserve_role_proof"
LABEL = "reserve.proof.owner"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="explicitly start the disposable native test")
    parser.add_argument("--docker-host", required=True, help="local Docker engine endpoint")
    parser.add_argument("--bash", default="bash", help="Bash executable (Git Bash on Windows)")
    args = parser.parse_args()
    if not args.run:
        parser.error("--run is required; this test does not start containers implicitly")
    if not (args.docker_host.startswith("npipe:") or args.docker_host.startswith("unix:")):
        parser.error("use a local npipe/unix Docker endpoint")

    owner = str(uuid.uuid4())
    name = "reserve-backup-roles-" + owner[:8]
    passwords = {user: secrets.token_hex(24) for user in ("root", "reserve_backup", "reserve_app", "reserve_ddl")}
    environment = os.environ.copy()
    environment.update(MYSQL_ROOT_PASSWORD=passwords["root"], MSYS_NO_PATHCONV="1", BASH_ENV="", ENV="")
    docker = [shutil.which("docker") or "docker", "--host", args.docker_host]
    container_id = None

    def redact(value):
        for password in passwords.values():
            value = value.replace(password, "[REDACTED]")
        return value

    def run(command, *, data=None, extra=None, check=True, timeout=120):
        result = subprocess.run(command, input=data, capture_output=True,
                                env={**environment, **(extra or {})}, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError(redact(result.stderr.decode("utf-8", errors="replace"))[-2500:])
        return result

    def sql(statement, user="root", check=True):
        return run(docker + ["exec", "-i", "-e", "MYSQL_PWD", name, "mysql", "--user=" + user, "-N", "-B"],
                   data=statement.encode(), extra={"MYSQL_PWD": passwords[user]}, check=check)

    def dump():
        return run(docker + ["exec", "-e", "MYSQL_PWD", name, "mysqldump", "--user=reserve_backup",
                             "--single-transaction", "--quick", "--no-tablespaces", "--routines", "--triggers",
                             "--events", "--set-gtid-purged=OFF", "--default-character-set=utf8mb4", DATABASE],
                   extra={"MYSQL_PWD": passwords["reserve_backup"]})

    def require(condition, message):
        if not condition:
            raise AssertionError(message)

    try:
        result = run(docker + ["run", "-d", "--name", name, "--label", LABEL + "=" + owner,
                              "--network", "none", "--memory", "768m", "--cpus", "1.5",
                              "--tmpfs", "/var/lib/mysql:rw,size=512m", "-e", "MYSQL_ROOT_PASSWORD", IMAGE,
                              "--skip-log-bin", "--skip-networking"])
        container_id = result.stdout.decode().strip()
        print("Starting isolated MySQL 8.0.45 (synthetic data, no network)", flush=True)
        for attempt in range(90):
            if sql("SELECT 1", check=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("MySQL readiness timed out")
        require(sql("SELECT VERSION()").stdout.decode().strip() == "8.0.45", "Unexpected MySQL version")

        statements = ["CREATE DATABASE " + DATABASE + ";", "USE " + DATABASE + ";"]
        statements += [f"CREATE TABLE t{i} (id INT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB;" for i in range(1, 13)]
        statements += ["INSERT INTO t1 VALUES (1, 10);", "INSERT INTO t2 VALUES (1, 0);",
                       "CREATE VIEW v_value AS SELECT value FROM t1;",
                       "CREATE PROCEDURE p_value() SQL SECURITY INVOKER SELECT value FROM t1;",
                       "CREATE TRIGGER tr_value AFTER INSERT ON t1 FOR EACH ROW UPDATE t2 SET value=value+1;",
                       "CREATE EVENT ev_value ON SCHEDULE EVERY 1 DAY DISABLE DO UPDATE t2 SET value=value+1;"]
        for user in ("reserve_backup", "reserve_app", "reserve_ddl"):
            statements.append(f"CREATE USER '{user}'@'localhost' IDENTIFIED BY '{passwords[user]}';")
        statements += [f"GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON {DATABASE}.* TO 'reserve_backup'@'localhost';",
                       f"GRANT SELECT, INSERT, UPDATE, DELETE ON {DATABASE}.* TO 'reserve_app'@'localhost';",
                       f"GRANT SELECT, CREATE, ALTER, DROP, INDEX, REFERENCES ON {DATABASE}.* TO 'reserve_ddl'@'localhost';"]
        sql("\n".join(statements))

        # mysqldump may exit successfully while omitting routine bodies.
        incomplete = dump()
        require(incomplete.returncode == 0 and len(re.findall(rb"^CREATE TABLE ", incomplete.stdout, re.M)) == 12,
                "Object coverage fixture was not dumped")
        require(not re.search(rb"\bPROCEDURE\s+`?p_value`?", incomplete.stdout),
                "The missing-routine privilege regression was not reproduced")
        routine_access_query = ("SELECT COUNT(*) FROM information_schema.user_privileges "
                                "WHERE privilege_type IN ('SHOW_ROUTINE','SELECT') AND grantee = "
                                "CONCAT(QUOTE(SUBSTRING_INDEX(CURRENT_USER(), '@', 1)), '@', "
                                "QUOTE(SUBSTRING_INDEX(CURRENT_USER(), '@', -1)));")
        require(sql(routine_access_query, "reserve_backup").stdout.decode().strip() == "0",
                "Missing routine privilege was not detected")
        require(int(sql(routine_access_query).stdout.decode().strip()) > 0,
                "Legacy root backup compatibility was rejected")
        sql("GRANT SHOW_ROUTINE ON *.* TO 'reserve_backup'@'localhost';")
        require(sql(routine_access_query, "reserve_backup").stdout.decode().strip() == "1",
                "SHOW_ROUTINE did not unlock the routine definition")
        complete = dump().stdout
        for kind, object_name in [("PROCEDURE", "p_value"), ("TRIGGER", "tr_value"), ("EVENT", "ev_value"), ("VIEW", "v_value")]:
            marker = rb"\b" + kind.encode() + rb"\s+`?" + object_name.encode() + rb"`?"
            require(re.search(marker, complete), "Backup omitted a schema object: " + object_name)
        print("PASS: successful dump without SHOW_ROUTINE omits the procedure; granting SHOW_ROUTINE preserves it", flush=True)

        old_flags = run(docker + ["exec", "-e", "MYSQL_PWD", name, "mysqldump", "--user=reserve_backup",
                                 "--single-transaction", "--set-gtid-purged=OFF", DATABASE],
                        extra={"MYSQL_PWD": passwords["reserve_backup"]}, check=False)
        require(b"PROCESS" in old_flags.stderr, "Missing PROCESS refusal was not reproduced")
        for user, forbidden in [("reserve_app", f"CREATE TABLE {DATABASE}.forbidden (id INT);"),
                                ("reserve_backup", f"INSERT INTO {DATABASE}.t1 VALUES (99,99);"),
                                ("reserve_ddl", f"INSERT INTO {DATABASE}.t1 VALUES (98,98);")]:
            require(sql(forbidden, user, check=False).returncode != 0, user + " has excessive privileges")
        sql(f"CREATE TABLE {DATABASE}.ddl_check (id INT); ALTER TABLE {DATABASE}.ddl_check ADD value INT; "
            f"CREATE INDEX value_idx ON {DATABASE}.ddl_check(value); DROP TABLE {DATABASE}.ddl_check;", "reserve_ddl")
        privilege_rows = sql("SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES "
                             "WHERE GRANTEE = '\\'reserve_backup\\'@\\'localhost\\'';").stdout.decode().splitlines()
        require(set(privilege_rows) <= {"USAGE", "SHOW_ROUTINE"} and "SHOW_ROUTINE" in privilege_rows,
                "Unexpected backup global privileges")
        dynamic_grants = sql("SELECT PRIV FROM mysql.global_grants WHERE USER='reserve_backup';").stdout.decode().splitlines()
        require(dynamic_grants == ["SHOW_ROUTINE"], "Unexpected backup dynamic grants")
        print("PASS: backup has no PROCESS/global SELECT; app DDL and backup/DDL data writes are denied", flush=True)

        with tempfile.TemporaryDirectory(prefix="reserve-backup-roles-") as temporary:
            directory = Path(temporary)
            source = Path(__file__).resolve().parents[1] / "backup-mysql.sh"
            wrapper = r'''
docker() {
    case "$1" in
        inspect)
            [[ "${!#}" == "$MYSQL_CONTAINER" ]] || return 98
            command docker --host "$ROLE_TEST_DOCKER_HOST" "$@" ;;
        exec)
            [[ "$#" -ge 5 && "$2" == -e && "$3" == MYSQL_PWD=* && "$4" == "$MYSQL_CONTAINER" ]] || return 98
            export MYSQL_PWD="${3#MYSQL_PWD=}"
            shift 4
            command docker --host "$ROLE_TEST_DOCKER_HOST" exec -e MYSQL_PWD "$MYSQL_CONTAINER" "$@" ;;
        *) return 98 ;;
    esac
}
aws() {
    [[ "$1" == s3api && "$2" == put-object && "$3" == --bucket && "$4" == reserve-synthetic-no-upload ]] || return 98
    [[ "$*" == *'--if-none-match *'* && "$*" == *'--server-side-encryption AES256'* ]] || return 98
    printf 'UPLOAD_STUB_ONLY\n' >> "$ROLE_TEST_UPLOAD_MARKER"
}
'''
            test_environment = {
                "ROLE_TEST_DOCKER_HOST": args.docker_host,
                "ROLE_TEST_UPLOAD_MARKER": (directory / "upload-stub").as_posix(),
                "MYSQL_CONTAINER": name, "DB_NAME": DATABASE, "DB_USER": "reserve_backup",
                "DB_PASSWORD": passwords["reserve_backup"], "BACKUP_DIR": directory.as_posix(),
                "LOG_FILE": (directory / "backup.log").as_posix(),
                "RESERVE_BACKUP_ENV": (directory / "absent.env").as_posix(),
                "BACKUP_S3_BUCKET": "reserve-synthetic-no-upload", "BACKUP_S3_PREFIX": "mysql",
                "LOCAL_RETENTION_DAYS": "7", "AWS_ACCESS_KEY_ID": "", "AWS_SECRET_ACCESS_KEY": "",
                "AWS_DEFAULT_REGION": "", "PATH": str(Path(docker[0]).parent) + os.pathsep + environment.get("PATH", ""),
            }
            shell = [args.bash, "--noprofile", "--norc", "-s"]
            shell_source = (wrapper + "\n" + source.read_text(encoding="utf-8")).encode()
            sql("REVOKE SHOW_ROUTINE ON *.* FROM 'reserve_backup'@'localhost';")
            refused = run(shell, data=shell_source, extra=test_environment, check=False)
            require(refused.returncode != 0 and b"stored routine definitions are not readable" in refused.stdout,
                    "Backup must refuse unreadable routines")
            require(not list(directory.glob("reserve-*.sql.gz")) and not (directory / "upload-stub").exists(),
                    "A refused backup must not leave an archive or upload")
            print("PASS: actual backup refuses missing routine definitions before creating an archive or uploading", flush=True)
            sql("GRANT SHOW_ROUTINE ON *.* TO 'reserve_backup'@'localhost';")
            run(shell, data=shell_source, extra=test_environment)
            require((directory / "upload-stub").read_text().strip() == "UPLOAD_STUB_ONLY", "AWS stub was not used exactly once")
            archives = list(directory.glob("reserve-*.sql.gz"))
            require(len(archives) == 1, "Expected one guarded backup archive")
            restored = gzip.decompress(archives[0].read_bytes())
            require(len(re.findall(rb"^CREATE TABLE ", restored, re.M)) == 12, "Unexpected backup table coverage")
            sql(f"DROP DATABASE {DATABASE}; CREATE DATABASE {DATABASE};")
            sql(f"USE {DATABASE};\n" + restored.decode())
            counts = sql(f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='{DATABASE}' AND table_type='BASE TABLE'; "
                         f"SELECT COUNT(*) FROM information_schema.views WHERE table_schema='{DATABASE}'; "
                         f"SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='{DATABASE}'; "
                         f"SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='{DATABASE}'; "
                         f"SELECT COUNT(*) FROM information_schema.events WHERE event_schema='{DATABASE}'; "
                         f"CALL {DATABASE}.p_value();").stdout.decode().splitlines()
            require(counts == ["12", "1", "1", "1", "1", "10"], "Restored object/data counts differ")
            print("PASS: actual backup script -> gzip -> native restore: 12 tables, view, procedure, trigger, event and data", flush=True)
            print("S3 upload: stub only; no production access or AWS writes", flush=True)
    finally:
        if container_id:
            inspected = run(docker + ["inspect", container_id], check=False)
            if inspected.returncode == 0:
                metadata = json.loads(inspected.stdout)[0]
                if metadata["Id"] != container_id or metadata["Config"]["Labels"].get(LABEL) != owner:
                    raise RuntimeError("Container ownership mismatch; refusing cleanup")
                run(docker + ["rm", "-f", container_id])
                print("Removed owned isolated container", flush=True)


if __name__ == "__main__":
    main()
