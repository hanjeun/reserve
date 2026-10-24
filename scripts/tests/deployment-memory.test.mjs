import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const liveId = 'a'.repeat(64);
const targetId = 'b'.repeat(64);
const nextId = 'c'.repeat(64);
const script = fileURLToPath(new URL('../check-deployment-memory.sh', import.meta.url));
const bashPath = value => process.platform === 'win32'
    ? value.replaceAll('\\', '/').replace(/^([a-z]):/i, (_match, drive) => `/${drive.toLowerCase()}`) : value;
const meminfo = available => `MemTotal: 1951772 kB\nMemAvailable: ${available} kB\nSwapTotal: 4194304 kB\nSwapFree: 3072320 kB\n`;
const dockerMock = String.raw`
set -euo pipefail
printf 'docker %s\n' "$*" >> "$TASK_CALLS"
count() {
    local previous=0 file="$TASK_STATE/$1"
    if [[ -f "$file" ]]; then read -r previous < "$file"; fi
    previous=$((previous + 1))
    printf '%s\n' "$previous" > "$file"
    printf '%s' "$previous"
}
if [[ $# == 8 && "$1 $2 $3 $4 $5 $7 $8" == 'container ls --all --no-trunc --filter --format {{.ID}}' ]]; then
    [[ "$MOCK_FAIL_READ" != listing ]] || exit 42
    case "$6" in
        "name=^/$MOCK_LIVE_SLOT"$) slot=live; state=$MOCK_LIVE_STATE; id=$MOCK_LIVE_ID; override=$MOCK_LIVE_LIST ;;
        "name=^/$MOCK_TARGET_SLOT"$) slot=target; state=$MOCK_TARGET_STATE; id=$MOCK_TARGET_ID; override=$MOCK_TARGET_LIST ;;
        *) exit 91 ;;
    esac
    turn=$(count "list-$slot")
    if [[ "$MOCK_RACE" == live-id && "$slot" == live && "$turn" -gt 1 ]]; then id=$MOCK_NEXT_ID; fi
    if [[ "$MOCK_RACE" == target-appears && "$slot" == target && "$turn" -gt 1 ]]; then state=running; fi
    if [[ -n "$override" ]]; then printf '%s\n' "$override"; elif [[ "$state" != absent ]]; then printf '%s\n' "$id"; fi
    exit 0
fi
if [[ $# == 5 && "$1 $2 $3 $4" == 'container inspect --format {{.Id}} {{.State.Status}} {{.State.Running}} {{.State.Paused}} {{.State.Restarting}} {{.State.StartedAt}}' ]]; then
    [[ "$MOCK_FAIL_READ" != inspection ]] || exit 42
    case "$5" in
        "$MOCK_LIVE_ID"|"$MOCK_NEXT_ID") slot=live; state=$MOCK_LIVE_STATE ;;
        "$MOCK_TARGET_ID") slot=target; state=$MOCK_TARGET_STATE ;;
        *) exit 91 ;;
    esac
    turn=$(count "inspect-$slot")
    started=2026-10-23T00:00:00Z
    if [[ "$MOCK_RACE" == live-start && "$slot" == live && "$turn" -gt 1 ]]; then started=2026-10-23T00:00:01Z; fi
    if [[ "$MOCK_RACE" == target-start && "$slot" == target && "$turn" -gt 1 ]]; then started=2026-10-23T00:00:01Z; fi
    if [[ "$MOCK_RACE" == live-stop && "$slot" == live && "$turn" -gt 1 ]]; then state=exited; fi
    if [[ "$MOCK_RACE" == target-appears && "$slot" == target ]]; then state=running; fi
    if [[ -n "$MOCK_INSPECT_OVERRIDE" ]]; then printf '%s\n' "$MOCK_INSPECT_OVERRIDE"; exit 0; fi
    running=false; paused=false; restarting=false
    case "$state" in
        running) running=true ;;
        paused) running=true; paused=true ;;
        restarting) running=true; restarting=true ;;
    esac
    printf '%s %s %s %s %s %s\n' "$5" "$state" "$running" "$paused" "$restarting" "$started"
    exit 0
fi
if [[ $# == 5 && "$1 $2 $3 $4" == 'stats --no-stream --format {{.MemUsage}}' ]]; then
    case "$5" in
        "$MOCK_LIVE_ID") [[ "$MOCK_FAIL_READ" != live-stats ]] || exit 42; printf '%s\n' "$MOCK_LIVE_USAGE" ;;
        "$MOCK_TARGET_ID") [[ "$MOCK_FAIL_READ" != target-stats ]] || exit 42; printf '%s\n' "$MOCK_TARGET_USAGE" ;;
        *) exit 91 ;;
    esac
    exit 0
fi
exit 91
`;
const catMock = String.raw`
set -euo pipefail
printf 'cat %s\n' "$*" >> "$TASK_CALLS"
[[ $# == 1 && "$1" == /proc/meminfo ]] || exit 91
[[ "$MOCK_FAIL_READ" != meminfo ]] || exit 42
printf '%s' "$MOCK_MEMINFO"
`;
const timeoutMock = String.raw`
set -euo pipefail
printf 'timeout %s\n' "$*" >> "$TASK_CALLS"
[[ $# -ge 4 && "$1" == --signal=TERM && "$2" == --kill-after=1s && "$3" =~ ^[1-5]s$ ]] || exit 91
[[ "$MOCK_TIMEOUT" != true ]] || exit 124
shift 3
exec "$@"
`;

function runMemory(overrides = {}, args = ['green', 'blue']) {
    const parent = path.resolve(os.tmpdir());
    const fixture = fs.mkdtempSync(path.join(parent, 'reserve-deployment-memory-test-'));
    const bin = path.join(fixture, 'bin');
    const state = path.join(fixture, 'state');
    const callsFile = path.join(fixture, 'calls');
    fs.mkdirSync(bin);
    fs.mkdirSync(state);
    fs.writeFileSync(callsFile, '');
    for (const [name, body] of Object.entries({ docker: dockerMock, cat: catMock, timeout: timeoutMock })) {
        fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
    }
    try {
        const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash',
            ['-c', 'export PATH="$TASK_MOCK_BIN:$PATH"; exec bash "$TASK_MEMORY_SCRIPT" "$@"', 'memory-test', ...args], {
                encoding: 'utf8', timeout: 15000,
                env: {
                    ...process.env, TASK_MOCK_BIN: bashPath(bin), TASK_STATE: bashPath(state),
                    TASK_CALLS: bashPath(callsFile), TASK_MEMORY_SCRIPT: bashPath(script),
                    MOCK_LIVE_ID: liveId, MOCK_TARGET_ID: targetId, MOCK_NEXT_ID: nextId,
                    MOCK_LIVE_SLOT: 'green', MOCK_TARGET_SLOT: 'blue', MOCK_LIVE_STATE: 'running',
                    MOCK_TARGET_STATE: 'absent', MOCK_LIVE_USAGE: '694MiB / 1.861GiB',
                    MOCK_TARGET_USAGE: '600MiB / 1.861GiB', MOCK_MEMINFO: meminfo(1048576),
                    MOCK_FAIL_READ: '', MOCK_TIMEOUT: 'false', MOCK_LIVE_LIST: '', MOCK_TARGET_LIST: '',
                    MOCK_RACE: '', MOCK_INSPECT_OVERRIDE: '', ...overrides,
                },
            });
        assert.ifError(result.error);
        const calls = fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean);
        for (let index = 0; index < calls.length; index++) {
            if (calls[index].startsWith('timeout ')) {
                assert.match(calls[index], /^timeout --signal=TERM --kill-after=1s [1-5]s (docker|cat) /);
            } else {
                assert.match(calls[index], /^(docker (container (ls|inspect) |stats --no-stream )|cat \/proc\/meminfo$)/);
                assert.ok(calls[index - 1].endsWith(' ' + calls[index]));
            }
        }
        return { ...result, calls, fields: Object.fromEntries([...result.stdout.matchAll(/([a-z_]+)=([^ \n]+)/g)]
            .map(match => [match[1], match[2]])) };
    } finally {
        assert.equal(path.dirname(path.resolve(fixture)), parent);
        assert.ok(path.basename(fixture).startsWith('reserve-deployment-memory-test-'));
        fs.rmSync(fixture, { recursive: true, force: true });
    }
}

function passes(result) {
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(result.fields.decision, 'allow');
}
function refuses(result, message) {
    assert.notEqual(result.status, 0, result.stderr + result.stdout);
    if (message) assert.match(result.stderr, message);
}

test('current reported RAM pressure denies a second app without crediting swap', () => {
    const result = runMemory({ MOCK_MEMINFO: meminfo(488172) });
    refuses(result, /insufficient available physical RAM/);
    assert.equal(result.fields.available_kib, '488172');
    assert.equal(result.fields.expected_kib, '786432');
    assert.equal(result.fields.required_kib, '1048576');
    assert.equal(result.fields.target_state, 'absent');
});

test('new target requires the 768 MiB floor and full 256 MiB spare, inclusive at the boundary', () => {
    passes(runMemory());
    const below = runMemory({ MOCK_MEMINFO: meminfo(1048575) });
    refuses(below, /insufficient/);
    assert.equal(below.fields.required_kib, '1048576');
});

test('a live app above the floor increases the new target budget', () => {
    const result = runMemory({ MOCK_LIVE_USAGE: '900MiB / 1.861GiB', MOCK_MEMINFO: meminfo(1183744) });
    passes(result);
    assert.equal(result.fields.expected_kib, '921600');
    assert.equal(result.fields.required_kib, '1183744');
});

test('a running target retry credits existing usage and still requires remaining growth plus spare', () => {
    const result = runMemory({ MOCK_TARGET_STATE: 'running', MOCK_MEMINFO: meminfo(488172) });
    passes(result);
    assert.equal(result.fields.target_kib, '614400');
    assert.equal(result.fields.growth_kib, '172032');
    assert.equal(result.fields.required_kib, '434176');
    refuses(runMemory({ MOCK_TARGET_STATE: 'running', MOCK_TARGET_USAGE: '128MiB / 1.861GiB',
        MOCK_MEMINFO: meminfo(488172) }), /insufficient/);
});

test('an already large target never skips the spare or subtracts its usage twice', () => {
    const result = runMemory({ MOCK_TARGET_STATE: 'running', MOCK_TARGET_USAGE: '900MiB / 1.861GiB',
        MOCK_MEMINFO: meminfo(262144) });
    passes(result);
    assert.equal(result.fields.growth_kib, '0');
    assert.equal(result.fields.required_kib, '262144');
    refuses(runMemory({ MOCK_TARGET_STATE: 'running', MOCK_TARGET_USAGE: '900MiB / 1.861GiB',
        MOCK_MEMINFO: meminfo(262143) }), /insufficient/);
});

test('a stopped target gets no RAM credit and needs no target stats read', () => {
    const result = runMemory({ MOCK_TARGET_STATE: 'exited', MOCK_TARGET_USAGE: 'not-read' });
    passes(result);
    assert.equal(result.fields.required_kib, '1048576');
    assert.equal(result.calls.filter(call => call === `docker stats --no-stream --format {{.MemUsage}} ${targetId}`).length, 0);
});

test('binary and decimal Docker units round usage upward to KiB', () => {
    for (const [usage, kib] of [
        ['786432.1KiB / 2GiB', '786433'], ['900MB / 2GB', '878907'],
    ]) {
        const result = runMemory({ MOCK_LIVE_USAGE: usage, MOCK_MEMINFO: meminfo(1500000) });
        passes(result);
        assert.equal(result.fields.live_kib, kib, usage);
    }
});

test('invalid or identical slot arguments are refused before any host or Docker read', () => {
    for (const args of [[], ['blue', 'blue'], ['blue;true', 'green']]) {
        const result = runMemory({}, args);
        refuses(result, /usage|distinct blue\/green/);
        assert.deepEqual(result.calls, []);
    }
});

test('a missing live app cannot be used as the deployment baseline', () => {
    refuses(runMemory({ MOCK_LIVE_STATE: 'absent' }), /live app must be running/);
});

test('a restarting target fails closed', () => {
    refuses(runMemory({ MOCK_TARGET_STATE: 'restarting' }), /unsupported state/);
});

test('ambiguous listings or the same resolved container ID fail closed', () => {
    refuses(runMemory({ MOCK_LIVE_LIST: `${liveId}\n${targetId}` }), /listing is ambiguous or malformed/);
    refuses(runMemory({ MOCK_TARGET_STATE: 'running', MOCK_TARGET_ID: liveId }), /same container/);
});

test('inconsistent or malformed inspect output fails closed', () => {
    refuses(runMemory({ MOCK_INSPECT_OVERRIDE:
        `${liveId} running true false false 2026-10-23T00:00:00Z\nextra` }), /inspection is malformed/);
});

test('every external read failure or timeout refuses deployment', () => {
    for (const point of ['live-stats', 'meminfo']) {
        refuses(runMemory({ MOCK_TARGET_STATE: 'running', MOCK_FAIL_READ: point }), /failed or timed out/);
    }
    refuses(runMemory({ MOCK_TIMEOUT: 'true' }), /failed or timed out/);
});

test('malformed or impossible Docker memory readings fail closed', () => {
    refuses(runMemory({ MOCK_LIVE_USAGE: 'unavailable' }), /memory format is invalid/);
    refuses(runMemory({ MOCK_LIVE_USAGE: '2GiB / 3GiB' }), /exceeds physical host RAM/);
});

test('missing, duplicate, invalid, or impossible MemAvailable is never replaced with free RAM or swap', () => {
    for (const value of [
        'MemTotal: 1951772 kB\nMemFree: 1800000 kB\nSwapFree: 4194304 kB\n',
        meminfo(1048576) + 'MemAvailable: 1048576 kB\n',
    ]) refuses(runMemory({ MOCK_MEMINFO: value }), /MemTotal\/MemAvailable is missing or invalid/);
});

test('a live restart or target appearance invalidates the memory snapshot', () => {
    for (const race of ['live-start', 'target-appears']) {
        refuses(runMemory({ MOCK_RACE: race }), /identity or state changed/);
    }
});
