#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'build',
  'dist',
  'coverage',
  'Claude outputs',
]);
const immutableSnapshotRoot = path.join(
  repoRoot,
  'docs',
  'design-system',
  'snapshots',
);

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function collectMarkdownFiles(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name) || isInside(immutableSnapshotRoot, absolute)) continue;
      collectMarkdownFiles(absolute, result);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      result.push(absolute);
    }
  }
  return result;
}

// 여는 펜스 길이부터 3까지 한 글자씩 줄여 가며, bodyStart 이후 가장 가까운 닫는 펜스 줄의 끝을 찾는다.
// 이전 정규식 /^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?: {0,3})\1[ \t]*$/gm 의 백트래킹 순서를 그대로 따른다.
function findFencedBlockEnd(markdown, fenceRun, bodyStart) {
  for (let length = fenceRun.length; length >= 3; length -= 1) {
    const closingFence = new RegExp(String.raw`^ {0,3}${fenceRun.slice(0, length)}[ \t]*$`, 'gm');
    closingFence.lastIndex = bodyStart;
    const closing = closingFence.exec(markdown);
    if (closing) return closing.index + closing[0].length;
  }
  return -1;
}

function removeFencedCode(markdown) {
  const openingFence = /^ {0,3}(?:`{3,}|~{3,})/gm;
  let result = '';
  let copiedUntil = 0;
  for (let opening = openingFence.exec(markdown); opening; opening = openingFence.exec(markdown)) {
    const lineEnd = markdown.indexOf('\n', openingFence.lastIndex);
    if (lineEnd === -1) break;
    const blockEnd = findFencedBlockEnd(markdown, opening[0].trimStart(), lineEnd + 1);
    if (blockEnd === -1) continue;
    result += markdown.slice(copiedUntil, opening.index);
    result += markdown.slice(opening.index, blockEnd).replaceAll(/[^\n]/g, ' ');
    copiedUntil = blockEnd;
    openingFence.lastIndex = blockEnd;
  }
  return result + markdown.slice(copiedUntil);
}
function lineNumberAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.codePointAt(index) === 10) line += 1;
  }
  return line;
}

function normalizeTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1).trim();

  // Markdown destinations may be followed by an optional quoted title.
  const titleMatch = target.match(/^(\S+?)(?:\s+["'(].*)$/);
  if (titleMatch) target = titleMatch[1];

  return target.replaceAll(String.raw`\ `, ' ');
}

function shouldIgnore(target) {
  return (
    target === '' ||
    target.startsWith('#') ||
    target.startsWith('//') ||
    target.startsWith('/') ||
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.includes('${{') ||
    target.includes('{{')
  );
}

function localPathFor(source, rawTarget) {
  const target = normalizeTarget(rawTarget);
  if (shouldIgnore(target)) return null;

  const withoutFragment = target.split('#', 1)[0].split('?', 1)[0];
  if (!withoutFragment) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    decoded = withoutFragment;
  }

  const platformPath = decoded.replaceAll('/', path.sep);
  return path.resolve(path.dirname(source), platformPath);
}

function extractTargets(markdown) {
  const targets = [];
  const patterns = [
    // Inline links and images. The destination intentionally stops at whitespace
    // or the first closing parenthesis; repository paths do not use parentheses.
    /!?\[[^[\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+["'(][^\n]*)?\)/g,
    // Reference definitions: [name]: path "optional title"
    /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm,
    // Simple HTML links and images used in README files.
    /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      targets.push({ raw: match[1], offset: match.index ?? 0 });
    }
  }
  return targets;
}

const markdownFiles = collectMarkdownFiles(repoRoot).sort((a, b) => a.localeCompare(b, 'en'));
const failures = [];
let checkedLinks = 0;

for (const source of markdownFiles) {
  const original = fs.readFileSync(source, 'utf8');
  const markdown = removeFencedCode(original);
  for (const { raw, offset } of extractTargets(markdown)) {
    const localPath = localPathFor(source, raw);
    if (!localPath) continue;
    checkedLinks += 1;

    if (!isInside(repoRoot, localPath) || !fs.existsSync(localPath)) {
      failures.push({
        source: path.relative(repoRoot, source).replaceAll(path.sep, '/'),
        line: lineNumberAt(markdown, offset),
        target: normalizeTarget(raw),
        escaped: !isInside(repoRoot, localPath),
      });
    }
  }
}

if (failures.length > 0) {
  console.error(`Documentation link validation failed (${failures.length}):`);
  for (const failure of failures) {
    const reason = failure.escaped ? 'path escapes repository' : 'target does not exist';
    console.error(`- ${failure.source}:${failure.line} -> ${failure.target} (${reason})`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Documentation links valid: ${checkedLinks} local targets across ${markdownFiles.length} Markdown files.`,
  );
}
