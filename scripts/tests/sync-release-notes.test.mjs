import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { changelogSections, releasePatch } from '../sync-release-notes.mjs';

const section = { version: 'v2.16.3', body: 'RESERVE를 더 안전하게 만들어요.\n\n- 인증 도구를 맞췄어요.\n\n편하게 이용해주세요.' };

test('notes use the exact Korean changelog without generated PR lists', () => {
  const sections = changelogSections(`# 변경내역\r\n\r\n## v2.16.3\r\n\r\n${section.body.replaceAll('\n', '\r\n')}\r\n\r\n## v2.16.2\r\n\r\n이전 내용이에요.\r\n`);
  assert.deepEqual(sections[0], section);
  const patch = releasePatch(section, { tagName: section.version, isDraft: true, isPrerelease: false });
  assert.equal(patch.body, section.body);
  assert.equal(Buffer.from(patch.body, 'utf8').toString('utf8'), section.body);
  assert.doesNotMatch(patch.body, /변경 PR:|전체 변경사항|What's Changed|Full Changelog|changelog:start/);
});

test('editing notes preserves the tag and both publication flags', () => {
  for (const isDraft of [true, false]) for (const isPrerelease of [true, false]) {
    assert.deepEqual(releasePatch(section, { tagName: section.version, isDraft, isPrerelease }), {
      tag_name: section.version, name: section.version, body: section.body, draft: isDraft, prerelease: isPrerelease,
    });
  }
});

test('ambiguous release identity, state or damaged text is rejected', () => {
  assert.throws(() => releasePatch(section, { tagName: 'untagged-other', isDraft: true, isPrerelease: false }), /identity/);
  assert.throws(() => releasePatch(section, { tagName: section.version }), /state/);
  assert.throws(() => releasePatch({ ...section, body: '\uFFFD' }, { tagName: section.version, isDraft: true, isPrerelease: false }), /valid/);
});

test('apply without a selected version fails before any GitHub call', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../sync-release-notes.mjs', import.meta.url)), '--apply'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /one explicit version/);
});
