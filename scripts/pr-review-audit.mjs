import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { resolveBin } from './resolve-bin.mjs';

export const REQUIRED_CHECKS = ['build-backend', 'build-frontend'];

/** A successful unrelated check must not hide missing build checks. This never approves or merges a PR. */
export function assessPullRequest(pr) {
    const checks = pr.statusCheckRollup ?? [];
    const nameOf = (check) => check.name ?? check.context;
    const missing = REQUIRED_CHECKS.filter((name) => !checks.some((check) => nameOf(check) === name));
    const failed = checks.filter((check) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']
        .includes(check.conclusion ?? check.state)).map(nameOf);
    const requiredNotSuccessful = checks.filter((check) => REQUIRED_CHECKS.includes(nameOf(check))
        && !['SUCCESS'].includes(check.conclusion ?? check.state)).map(nameOf);
    const pending = checks.filter((check) => check.status !== 'COMPLETED'
        && !['SUCCESS', 'FAILURE', 'ERROR'].includes(check.state)
        && !check.conclusion).map(nameOf);
    return {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        head: pr.headRefOid,
        base: pr.baseRefName,
        missing,
        failed,
        pending,
        requiredNotSuccessful,
        labels: (pr.labels ?? []).map((label) => label.name),
        draft: pr.isDraft,
        checksReady: !pr.isDraft && missing.length === 0 && failed.length === 0
            && requiredNotSuccessful.length === 0 && pending.length === 0,
    };
}

export function auditOpenPullRequests(repo = 'hanjeun/reserve') {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Use an owner/repository name.');
    const output = execFileSync(resolveBin('gh'), [
        'pr', 'list', '--repo', repo, '--state', 'open', '--limit', '1000', '--json',
        'number,title,url,headRefOid,baseRefName,isDraft,labels,statusCheckRollup',
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60_000, windowsHide: true });
    const prs = JSON.parse(output);
    if (prs.length === 1000) throw new Error('PR limit reached; audit is incomplete.');
    return prs.map(assessPullRequest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log('node scripts/pr-review-audit.mjs [--json] [--repo owner/repository]\nRead-only GitHub PR/check inventory. No merge, rerun, label or repository mutation.');
    } else {
        let repo = 'hanjeun/reserve';
        let json = false;
        for (let index = 0; index < args.length; index++) {
            if (args[index] === '--json') json = true;
            else if (args[index] === '--repo' && args[index + 1]) repo = args[++index];
            else throw new Error(`Unsupported argument: ${args[index]}`);
        }
        const report = auditOpenPullRequests(repo);
        if (json) console.log(JSON.stringify(report, null, 2));
        else {
            console.log(`${repo}: ${report.length} open PRs (read-only snapshot)`);
            for (const pr of report) {
                console.log(`#${pr.number} ${pr.title}\n  head=${pr.head.slice(0, 12)} base=${pr.base} labels=${pr.labels.join(',') || '(none)'}`);
                console.log(`  ${pr.checksReady ? 'Checks successful; code review still required' : 'Not ready'}; missing=${pr.missing.join(',') || '-'}; failed=${pr.failed.join(',') || '-'}; pending=${pr.pending.join(',') || '-'}; required-not-successful=${pr.requiredNotSuccessful.join(',') || '-'}`);
            }
        }
    }
}
