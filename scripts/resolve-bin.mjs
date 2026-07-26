/**
 * resolve-bin.mjs
 * ──────────────────────────────────────────────────────────────
 * 외부 실행 파일(gh, git)의 "절대 경로"를 돌려준다.
 *
 * 왜 필요한가 (SonarCloud S4036):
 *   execFileSync('gh', ...) 처럼 이름만 넘기면 OS가 PATH를 순서대로 뒤져서 실행한다.
 *   PATH 안에 쓰기 가능한 디렉터리가 하나라도 섞여 있으면, 거기에 gh 라는 이름의 파일을
 *   심어두는 것만으로 우리 스크립트가 그걸 대신 실행하게 된다(= gh 토큰 권한 탈취).
 *   그래서 PATH 탐색에 의존하지 않고 표준 설치 경로에서 직접 찾아 절대 경로로 실행한다.
 *
 * 설치 위치가 표준이 아니면 환경변수로 지정한다:
 *   PowerShell:  $env:GH_BIN = "D:\tools\gh.exe"
 *   bash:        GH_BIN=/opt/gh/bin/gh node scripts/...
 */
import { existsSync } from 'node:fs';

// 각 OS의 기본 설치 경로. 앞에 있는 것부터 확인한다.
const CANDIDATES = {
    win32: {
        gh: [
            'C:\\Program Files\\GitHub CLI\\gh.exe',
            'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
        ],
        git: [
            'C:\\Program Files\\Git\\cmd\\git.exe',
            'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        ],
    },
    other: {
        gh: ['/usr/bin/gh', '/usr/local/bin/gh', '/opt/homebrew/bin/gh'],
        git: ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'],
    },
};

/**
 * @param {'gh'|'git'} name
 * @returns {string} 실행 파일 절대 경로
 */
export function resolveBin(name) {
    const envKey = `${name.toUpperCase()}_BIN`;
    const override = process.env[envKey];

    if (override) {
        if (!existsSync(override)) {
            console.error(`${envKey} 에 지정된 경로에 파일이 없습니다: ${override}`);
            process.exit(1);
        }
        return override;
    }

    const table = process.platform === 'win32' ? CANDIDATES.win32 : CANDIDATES.other;
    const found = (table[name] || []).find((p) => existsSync(p));

    if (!found) {
        console.error(
            `${name} 실행 파일을 표준 설치 경로에서 찾지 못했습니다.\n` +
            `${envKey} 환경변수에 절대 경로를 지정해 주세요. ` +
            `(현재 위치 확인: PowerShell "(Get-Command ${name}).Source")`
        );
        process.exit(1);
    }

    return found;
}
