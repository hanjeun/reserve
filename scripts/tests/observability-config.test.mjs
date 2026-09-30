import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const config = read('promtail-config.yml');
const nginxJob = config.slice(config.indexOf('  - job_name: nginx'));
const quotedPattern = nginxJob.match(/selector: '\{job="nginx"\} !~ (".+")'/)?.[1];
assert.ok(quotedPattern, 'Promtail 2.9 match selectors require a double-quoted pattern');
const selector = JSON.parse(quotedPattern);
// JS lacks RE2's POSIX whitespace class; this one class has the same test meaning.
const allowedTiming = new RegExp(selector.replaceAll('[[:space:]]', String.raw`\s`));
const timing = {
  time: '1790772000.123', route: 'store_list', method: 'GET', status: 200,
  request_time: '0.019', upstream_connect_time: '0.001', upstream_header_time: '0.018',
  upstream_response_time: '0.018', cache: '',
};

test('nginx accepts only complete privacy-safe timing records, including Docker newline', () => {
  assert.equal(allowedTiming.test(JSON.stringify(timing)), true);
  assert.equal(allowedTiming.test(`${JSON.stringify(timing)}\n`), true);
  assert.equal(allowedTiming.test(JSON.stringify({ ...timing, upstream_response_time: '0.018, 0.012 : 0.005' })), true);
});

test('nginx rejects client, request, query and secret fields even beside valid timing data', () => {
  for (const field of ['remote_addr', 'request', 'request_uri', 'query', 'cookie', 'token']) {
    assert.equal(allowedTiming.test(JSON.stringify({ ...timing, [field]: 'SYNTHETIC_PRIVATE_VALUE' })), false);
  }
});

test('nginx rejects stderr, malformed data and user-controlled route labels', () => {
  assert.equal(allowedTiming.test('2026/09/30 [error] synthetic request detail'), false);
  assert.equal(allowedTiming.test(JSON.stringify({ ...timing, route: '/api/stores/42?token=synthetic' })), false);
  assert.equal(allowedTiming.test(JSON.stringify({ ...timing, request_time: 'not-a-duration' })), false);
  assert.ok(nginxJob.includes(`selector: '{job="nginx", stream!="stdout"}'`));
  assert.ok(nginxJob.indexOf('- docker: {}') < nginxJob.indexOf('stream!="stdout"'));
});

test('backup retains both deployed formats and UTC timestamps in its own job', () => {
  const backupJob = config.slice(config.indexOf('  - job_name: backup'), config.indexOf('  - job_name: nginx'));
  const expression = backupJob.match(/expression: '([^']+)'/)?.[1];
  assert.ok(expression);
  const backup = new RegExp(expression.replaceAll('(?P<', '(?<'));
  for (const line of ['2026-09-30 18:10:06 [backup] === backup done', '2026-09-30 18:10:06 INFO [backup] === backup done']) {
    assert.equal(backup.exec(line)?.groups.ts, '2026-09-30 18:10:06');
  }
  assert.equal(backup.test('2026-09-30 application message'), false);
  assert.ok(backupJob.includes('location: UTC'));
  assert.ok(backupJob.includes('__path__: /var/log/reserve/backup.log'));
});

test('application and backup paths cannot collide and existing positions are retained', () => {
  assert.ok(config.includes('__path__: /var/log/reserve/app.log'));
  assert.equal(config.includes('__path__: /var/log/reserve/*.log'), false);
  assert.ok(config.includes('filename: /tmp/positions.yaml'));
  assert.ok(nginxJob.includes('older_than: 1h'));
});

test('collector separates user/system/iowait/steal while keeping the legacy aggregate', () => {
  const collector = read('scripts/collect-metrics.sh');
  assert.ok(collector.includes('read -r CPU_USER CPU_SYSTEM CPU_EXEC CPU_IDLE CPU_WAIT CPU_STEAL'));
  assert.ok(collector.includes("awk '{print $13, $14, $13+$14, $15, $16, $17}'"));
  for (const metric of ['cpu_pct', 'cpu_exec_pct', 'cpu_user_pct', 'cpu_system_pct', 'cpu_iowait_pct', 'cpu_steal_pct']) {
    assert.ok(collector.includes(`emit_host ${metric}`));
  }
  assert.ok(collector.includes('vmstat 1 2 | tail -1'));
});

test('compose overlay mounts only the selected directory read-only without creating it', () => {
  const overlay = read('docker-compose-observability.yml');
  assert.ok(overlay.includes('RESERVE_NGINX_LOG_DIR:?'));
  assert.ok(overlay.includes('target: /var/log/reserve-nginx'));
  assert.ok(overlay.includes('read_only: true'));
  assert.ok(overlay.includes('create_host_path: false'));
  assert.equal(overlay.includes('docker.sock'), false);
  assert.equal(overlay.includes('grafana:'), false);
  assert.equal(overlay.includes('nginxserver:'), false);
});
