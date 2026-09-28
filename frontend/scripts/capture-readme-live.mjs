/**
 * README 스크린샷을 **실제 서비스 화면·실제 가게 데이터**로 찍는다.
 *
 * generate-readme-assets.mjs 는 API 를 가짜 데이터로 막아 찍는 "합성" 생성기다(샘플 커피 스튜디오 등).
 * 이 스크립트는 반대로 API 를 막지 않고, 지정한 사이트(기본: 운영)에 실제로 접속해 찍는다.
 * 아키텍처 그림은 찍지 않는다 — README 는 피그마 원본(docs/images/RESERVE_Architecture.png)을 쓴다.
 * 모니터링(monitoring.png)은 운영 Grafana(grafana.reserve.it.kr)의 "RESERVE 로그" 대시보드 요약 카드를 찍는다.
 * 로그 원문 패널은 접힌 상태 그대로 둔다 — 요청 경로·IP 같은 원문이 이미지에 들어가지 않게.
 *
 * 사용법 (frontend 폴더에서, PowerShell):
 *   공개 화면만(로그인 불필요)      npm run capture:readme
 *
 *   사업자·관리자 화면까지 — Google 로그인 계정은 이 방법을 쓴다:
 *     1) 캡처 전용 Chrome 을 연다(평소 Chrome 프로필과 분리된 새 프로필)
 *          & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\RESERVE-README-Chrome"
 *     2) 그 창에서 평소처럼 reserve.it.kr 에 Google 로 로그인한다(사람이 직접 — 자동화하지 않는다)
 *        모니터링도 찍으려면 같은 창에서 grafana.reserve.it.kr 에도 로그인한다
 *     3) npm run capture:readme:auth    ← 그 창의 로그인 상태만 복사해 온다. 복사 후 그 Chrome 은 닫는다
 *     4) npm run capture:readme         ← 공개 + 사업자·관리자 화면
 *     5) 다 찍었으면 npm run capture:readme:clean  ← 저장한 로그인 상태 삭제
 *
 *   일부만 다시 찍기:  npm run capture:readme -- --only=monitoring   (쉼표로 여러 개: --only=business,admin)
 *
 *   이메일·비밀번호 계정이면 3) 대신 npm run capture:readme -- --login 으로 Playwright 창에서 로그인해도 된다.
 *   (Google 은 자동화 브라우저 로그인을 "안전하지 않은 브라우저"로 막는다. 이 스크립트는 그걸 우회하지 않는다)
 *
 *   옵션(환경변수):
 *     README_BASE_URL   찍을 사이트. 기본 https://reserve.it.kr  (로컬: http://localhost:5173)
 *     README_STORE_ID   가게 상세로 찍을 가게 id. 기본은 가게 목록 첫 번째
 *     README_CDP_PORT   캡처 전용 Chrome 의 디버깅 포트. 기본 9222
 *     README_GRAFANA_URL  모니터링 대시보드 주소. 기본 https://grafana.reserve.it.kr/d/reserve-logs
 *
 * 로그인 상태는 frontend/.readme-capture/auth.json 한 파일에만 둔다(.gitignore). 다시 찍을 때마다 로그인하지 않도록
 * --clean 전까지 유지하고, 찍을 때마다 최신 상태로 덮어쓴다 — RESERVE 는 리프레시 토큰을 회전시키고 옛 토큰 재사용을
 * 탈취로 보고 세션을 끊으므로, 캡처 중 회전된 토큰을 저장해 둬야 다음 실행이 옛 토큰을 쓰지 않는다.
 * 이메일·전화번호는 찍기 전에 화면에서 가린다. 이름 등은 남을 수 있으니 커밋 전에 이미지를 직접 확인할 것.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const REPOSITORY_DIR = path.resolve(FRONTEND_DIR, '..');
const OUTPUT_DIR = path.join(REPOSITORY_DIR, 'docs', 'images', 'readme-v2.6');
const AUTH_DIR = path.join(FRONTEND_DIR, '.readme-capture');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');
const BASE_URL = (process.env.README_BASE_URL || 'https://reserve.it.kr').replace(/\/+$/, '');
const VIEWPORT = { width: 1600, height: 900 };
const CDP_URL = `http://127.0.0.1:${process.env.README_CDP_PORT || 9222}`;
const GRAFANA_URL = process.env.README_GRAFANA_URL || 'https://grafana.reserve.it.kr/d/reserve-logs';
// 로그인 상태 파일에는 RESERVE·Grafana 쿠키만 남긴다(같은 Chrome 의 Google 등 다른 사이트 쿠키는 버린다).
const AUTH_DOMAINS = [new URL(BASE_URL).hostname, new URL(GRAFANA_URL).hostname];
const ONLY = (process.argv.find(arg => arg.startsWith('--only=')) ?? '').slice('--only='.length)
    .split(',').map(name => name.trim()).filter(Boolean);

async function login() {
    await mkdir(AUTH_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ko-KR' });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('열린 브라우저에서 이메일·비밀번호 계정으로 로그인한 뒤 여기서 Enter 를 누르세요(Google 계정은 --auth 방식)... ');
    rl.close();
    await context.storageState({ path: AUTH_FILE });
    await browser.close();
    console.log('로그인 상태를 임시 저장했습니다. 이제 옵션 없이 다시 실행하세요.');
}

// 사람이 직접 로그인한 캡처 전용 Chrome 에 붙어서 RESERVE 쿠키만 파일로 복사한다. Google 로그인은 건드리지 않는다.
async function importAuthFromChrome() {
    await mkdir(AUTH_DIR, { recursive: true });
    let browser;
    try {
        browser = await chromium.connectOverCDP(CDP_URL);
    } catch {
        throw new Error(`${CDP_URL} 에 연결하지 못했습니다. 스크립트 맨 위 주석의 1) 명령으로 캡처 전용 Chrome 을 먼저 여세요.`);
    }
    try {
        const context = browser.contexts()[0];
        const state = context ? await context.storageState() : { cookies: [], origins: [] };
        const belongs = host => AUTH_DOMAINS.some(domain => host.replace(/^\./, '') === domain);
        const cookies = state.cookies.filter(cookie => belongs(cookie.domain));
        const origins = state.origins.filter(origin => belongs(new URL(origin.origin).hostname));
        if (cookies.length === 0) {
            throw new Error(`그 Chrome 에 ${AUTH_DOMAINS.join(' / ')} 로그인 쿠키가 없습니다. 그 창에서 먼저 로그인하세요.`);
        }
        await writeFile(AUTH_FILE, `${JSON.stringify({ cookies, origins }, null, 2)}\n`, 'utf8');
        const counts = AUTH_DOMAINS.map(domain => `${domain} ${cookies.filter(cookie => cookie.domain.replace(/^\./, '') === domain).length}개`);
        console.log(`로그인 상태를 복사했습니다(${counts.join(', ')} — 값은 출력하지 않음).`);
        console.log('이제 캡처 전용 Chrome 창을 닫고 npm run capture:readme 를 실행하세요.');
    } finally {
        // connectOverCDP 로 붙은 브라우저의 close 는 연결만 끊는다 — 사용자의 Chrome 창은 그대로다.
        await browser.close();
    }
}

async function cleanAuth() {
    await rm(AUTH_DIR, { recursive: true, force: true });
    console.log('저장한 로그인 상태를 지웠습니다.');
}

async function firstStoreId() {
    if (process.env.README_STORE_ID) return process.env.README_STORE_ID;
    const response = await fetch(`${BASE_URL}/api/stores?page=0&size=1`);
    const body = await response.json();
    const data = body?.data ?? body;
    const list = Array.isArray(data) ? data : data?.content;
    const id = list?.[0]?.id;
    if (!id) throw new Error('가게 목록이 비어 있습니다. README_STORE_ID 를 지정하세요.');
    return id;
}

// 로딩 골격(스켈레톤)이 사라지고 이미지가 다 뜰 때까지 기다린다.
// networkidle 은 쓰지 않는다 — 메신저 폴링 때문에 네트워크가 끝나지 않을 수 있다.
async function waitReady(page, { grafana = false } = {}) {
    if (grafana) {
        // Grafana 는 패널마다 따로 쿼리한다 — 로딩 막대가 다 사라지고 숫자가 그려질 때까지 기다린다.
        await page.waitForSelector('.react-grid-layout', { timeout: 30_000 })
            .catch(() => console.warn('  ! Grafana 대시보드가 30초 안에 뜨지 않았습니다. 그대로 찍습니다.'));
        await page.waitForFunction(() => document.querySelectorAll('[aria-label="Panel loading bar"]').length === 0,
            null, { timeout: 30_000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(2000);
        return;
    }
    await page.waitForFunction(() => {
        const busy = document.querySelector('[aria-busy="true"], .reserve-skeleton-block, .ant-skeleton');
        return !busy || busy.getClientRects().length === 0;
    }, null, { timeout: 30_000 }).catch(() => console.warn('  ! 로딩 표시가 30초 안에 사라지지 않았습니다. 그대로 찍습니다.'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => image.complete), null, { timeout: 10_000 })
        .catch(() => {});
    await page.waitForTimeout(800);
}

// 이메일·전화번호를 화면에서 가린다(스크린샷에만 적용, 서버 데이터는 그대로).
async function maskPersonalText(page) {
    await page.evaluate(() => {
        const email = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
        const phone = /(01[016789]|0\d{1,2})[-\s]?\d{3,4}[-\s]?(\d{4})/g;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const before = node.textContent;
            const after = before.replace(email, '$1***@$2').replace(phone, '$1-****-$2');
            if (after !== before) node.textContent = after;
        }
    });
}

function newCaptureContext(browser, auth) {
    return browser.newContext({
        viewport: VIEWPORT,
        colorScheme: 'light',
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
        storageState: auth ? AUTH_FILE : undefined,
    });
}

async function capture(context, { name, pathname, url, auth, grafana }) {
    const page = await context.newPage();
    try {
        const target = url ?? `${BASE_URL}${pathname}`;
        console.log(`Capturing ${name} (${target})...`);
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        await waitReady(page, { grafana });
        if (auth && await landedOnLogin(page)) {
            console.warn(`  ! ${name}: 로그인 화면으로 돌아갔습니다(로그인 만료·권한 없음). 이 화면은 건너뜁니다 — 기존 ${name}.png 는 그대로 남습니다.`);
            return null;
        }
        await maskPersonalText(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        const image = await page.screenshot({ fullPage: false });
        return (await saveImage(name, image)) ? name : null;
    } catch (error) {
        // 한 화면이 실패해도 나머지는 계속 찍는다(특히 로그인 화면의 회전된 토큰 저장까지 가야 한다).
        console.warn(`  ! ${name}: 찍지 못했습니다 — ${error.message.split('\n')[0]}`);
        return null;
    } finally {
        await page.close();
    }
}

// 리다이렉트가 waitReady 이후에 끝나는 경우도 있어 주소와 로그인 폼을 둘 다 본다.
async function landedOnLogin(page) {
    if (new URL(page.url()).pathname.startsWith('/login')) return true;
    return (await page.locator('input[type="password"]').count()) > 0;
}

// Windows 에서는 이미지 뷰어·IDE 미리보기·탐색기 미리보기 창·백신이 PNG 를 잡고 있으면 덮어쓰기가
// EBUSY/EPERM/UNKNOWN(-4094)으로 실패한다. 임시 파일에 쓴 뒤 바꿔치기하고, 잠겨 있으면 잠깐씩 다시 시도한다.
// 끝내 안 되면 <이름>.new.png 로 남겨 찍은 결과를 잃지 않는다.
async function saveImage(name, image) {
    const target = path.join(OUTPUT_DIR, `${name}.png`);
    const temp = path.join(OUTPUT_DIR, `.${name}.png.tmp`);
    await writeFile(temp, image);
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        try {
            await rename(temp, target);
            return true;
        } catch (error) {
            if (attempt === 6) {
                const fallback = path.join(OUTPUT_DIR, `${name}.new.png`);
                await rename(temp, fallback).catch(() => {});
                console.warn(`  ! ${name}.png 를 덮어쓰지 못했습니다(${error.code}) — 다른 프로그램이 파일을 열고 있는지 확인하세요.`);
                console.warn(`    찍은 결과는 ${path.basename(fallback)} 로 저장했습니다. 그 프로그램을 닫고 이름을 바꾸거나 다시 실행하세요.`);
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
    }
    return false;
}

async function writeManifest(captured) {
    const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
    const previous = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { files: [] };
    const files = new Map((previous.files ?? []).map(file => [file.path, file]));
    for (const name of captured) {
        const filename = `${name}.png`;
        const contents = await readFile(path.join(OUTPUT_DIR, filename));
        files.set(filename, {
            path: filename,
            bytes: contents.byteLength,
            sha256: createHash('sha256').update(contents).digest('hex'),
            source: name === 'monitoring' ? new URL(GRAFANA_URL).origin : BASE_URL,
            capturedAt: new Date().toISOString(),
        });
    }
    const manifest = {
        schemaVersion: 2,
        purpose: 'README screenshots. Files with "source" were captured from a real site; others come from the synthetic generator.',
        viewport: VIEWPORT,
        generators: ['frontend/scripts/capture-readme-live.mjs', 'frontend/scripts/generate-readme-assets.mjs'],
        files: [...files.values()],
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
    if (process.argv.includes('--login')) {
        await login();
        return;
    }
    if (process.argv.includes('--auth')) {
        await importAuthFromChrome();
        return;
    }
    if (process.argv.includes('--clean')) {
        await cleanAuth();
        return;
    }
    await mkdir(OUTPUT_DIR, { recursive: true });
    const hasAuth = existsSync(AUTH_FILE);
    const wanted = scene => ONLY.length === 0 || ONLY.includes(scene.name);
    const needsStoreId = ONLY.length === 0 || ONLY.includes('store-detail');
    const storeId = needsStoreId ? await firstStoreId() : null;
    const publicScenes = [
        { name: 'home', pathname: '/' },
        { name: 'stores', pathname: '/stores' },
        { name: 'store-detail', pathname: `/store/${storeId}` },
    ].filter(wanted);
    const authScenes = [
        { name: 'business', pathname: '/business?tab=analytics', auth: true },
        { name: 'admin', pathname: '/admin?tab=dashboard', auth: true },
        // kiosk: Grafana 메뉴를 숨긴다. theme=light: README 의 다른 화면과 톤을 맞춘다.
        { name: 'monitoring', url: `${GRAFANA_URL}?orgId=1&kiosk&theme=light`, auth: true, grafana: true },
    ].filter(wanted);
    const unknown = ONLY.filter(name => ![...publicScenes, ...authScenes].some(scene => scene.name === name));
    if (unknown.length) throw new Error(`--only 에 모르는 화면이 있습니다: ${unknown.join(', ')} (home, stores, store-detail, business, admin, monitoring)`);
    if (!hasAuth && authScenes.length) console.log('저장된 로그인 상태가 없어 사업자·관리자·모니터링 화면은 건너뜁니다(스크립트 맨 위 주석 참고).');

    const browser = await chromium.launch({ headless: true });
    const captured = [];
    try {
        if (publicScenes.length) {
            const publicContext = await newCaptureContext(browser, false);
            for (const scene of publicScenes) captured.push(await capture(publicContext, scene));
            await publicContext.close();
        }

        if (hasAuth && authScenes.length) {
            // 로그인 화면들은 컨텍스트 하나를 같이 쓴다 — 따로 열면 앞 화면이 회전시킨 리프레시 토큰을
            // 뒤 화면이 옛 값으로 다시 써서 서버가 재사용(탈취)으로 판단하고 세션을 끊는다.
            const authContext = await newCaptureContext(browser, true);
            try {
                for (const scene of authScenes) captured.push(await capture(authContext, scene));
            } finally {
                await authContext.storageState({ path: AUTH_FILE });
                await authContext.close();
            }
        }
    } finally {
        await browser.close();
    }
    const done = captured.filter(Boolean);
    await writeManifest(done);
    const skipped = [...publicScenes, ...(hasAuth ? authScenes : [])].map(scene => scene.name).filter(name => !done.includes(name));
    console.log(`완료: ${done.join(', ') || '(없음)'} → ${OUTPUT_DIR}`);
    if (skipped.length) console.log(`새로 찍지 못한 화면: ${skipped.join(', ')} — 이 파일들은 이전 이미지 그대로입니다.`);
    if (hasAuth) console.log('로그인 상태는 다시 찍을 수 있게 남겨 뒀습니다. 끝났으면 npm run capture:readme:clean');
    console.log('커밋 전에 이미지에 개인정보(이름 등)가 남아 있지 않은지 직접 확인하세요.');
}

await main();
