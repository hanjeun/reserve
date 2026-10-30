import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const patterns = [
  [
    "private-key",
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
  ],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255})\b/g,
  ],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  [
    "credential-url",
    /\b(?:mysql|postgres(?:ql)?|redis|rediss):\/\/[^\s/:]+:[^\s/@${}]+@/g,
  ],
];
const privateNames =
  /(?:secret|password|private.key|encryption.key|access.key|webhook.key|api.key|token)/i;
const privateConfigName =
  /(?:secret(?:[-_.]?key)?|password|encryption[-_.]?key|private[-_.]?key|(?:api|access)[-_.]?key(?:[-_.]?id)?)$/i;
const configPath =
  /(?:^|\/)(?:application[^/]*\.(?:yml|yaml|properties)|[^/]*\.env(?:\.[^/]*)?|local\.properties)$/;
const testPath =
  /(?:^|\/)(?:test|tests|fixtures|__tests__)(?:\/|$)|\.(?:test|spec)\./;

/** 결과에는 일치한 값·주변 원문·값의 해시를 포함하지 않아요. */
export function scanText(file, content) {
  const result = [];
  for (const [rule, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern))
      result.push({
        file,
        line: content.slice(0, match.index).split("\n").length,
        rule,
      });
  }
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const browser = line.match(/\bVITE_[A-Z0-9_]+\b/g) || [];
    if (!testPath.test(file) && browser.some((name) => privateNames.test(name)))
      result.push({ file, line: index + 1, rule: "browser-private-variable" });
    if (!testPath.test(file) && configPath.test(file)) {
      const entry = line.match(
        /^\s*([\w.-]+)\s*[:=]\s*["']?([^#\r\n]*?)["']?\s*$/,
      );
      if (entry && privateConfigName.test(entry[1])) {
        const value = entry[2].trim().replace(/["']$/, "");
        if (
          value &&
          !/^\$\{[A-Z0-9_]+(?::)?\}$/.test(value) &&
          !/^(?:true|false|\[\]|\{\})$/.test(value)
        )
          result.push({ file, line: index + 1, rule: "literal-config-secret" });
      }
    }
  }
  return result;
}

export function scanRepository(root, additional = []) {
  const files = execFileSync(
    "git",
    ["ls-files", "-co", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
  const findings = [];
  let scanned = 0;
  for (const file of new Set([...files, ...additional])) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const relative = path.relative(root, fs.realpathSync(absolute));
    if (
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative) ||
      path.isAbsolute(file)
    ) {
      findings.push({ file, line: 1, rule: "external-file-link" });
      continue;
    }
    const bytes = fs.readFileSync(absolute);
    if (bytes.includes(0)) continue;
    scanned++;
    findings.push(...scanText(file, bytes.toString("utf8")));
  }
  return { scanned, findings };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  if (
    args.length % 2 ||
    args.some((arg, index) => index % 2 === 0 && arg !== "--include")
  )
    throw new Error("Use --include with a repository-relative file path");
  const result = scanRepository(
    root,
    args.filter((_, index) => index % 2 === 1),
  );
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = result.findings.length ? 1 : 0;
}
