/** PATH 탐색을 피하고 표준 설치 경로나 명시한 절대 경로에서 실행 파일을 찾는다. */
import { existsSync } from 'node:fs';

const CANDIDATES = {
    win32: {
        gh: [
            String.raw`C:\Program Files\GitHub CLI\gh.exe`,
            String.raw`C:\Program Files (x86)\GitHub CLI\gh.exe`,
        ],
        git: [
            String.raw`C:\Program Files\Git\cmd\git.exe`,
            String.raw`C:\Program Files (x86)\Git\cmd\git.exe`,
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
