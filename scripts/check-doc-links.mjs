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

function removeFencedCode(markdown) {
  return markdown.replace(/^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?: {0,3})\1[ \t]*$/gm, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
}
function lineNumberAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function normalizeTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1).trim();

  // Markdown destinations may be followed by an optional quoted title.
  const titleMatch = target.match(/^(\S+?)(?:\s+["'(].*)$/);
  if (titleMatch) target = titleMatch[1];

  return target.replace(/\\ /g, ' ');
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
    /!?\[[^\]\n]*\]\((<[^>\n]+>|[^\s)\n]+)(?:\s+["'(][^\n]*)?\)/g,
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

const markdownFiles = collectMarkdownFiles(repoRoot).sort();
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
