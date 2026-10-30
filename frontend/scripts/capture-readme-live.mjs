/*
 * 운영 사이트와 실제 공개 데이터에 접속하는 캡처 도구다. 로그인은 사용자가 별도 프로필에서 진행하며 저장한 인증 상태는 토큰 회전에 맞춰 갱신한다. 연락처·로그 원문은 노출하지 않고 결과 이미지의 개인정보를 직접 확인한다.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { README_IMAGE_FILENAMES, readmeImageDimensions } from './readme-image-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const REPOSITORY_DIR = path.resolve(FRONTEND_DIR, '..');
const OUTPUT_DIR = path.join(REPOSITORY_DIR, 'docs', 'images');
const AUTH_DIR = path.join(FRONTEND_DIR, '.readme-capture');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');
const BASE_URL = (process.env.README_BASE_URL || 'https://app.reserve.it.kr').replace(/(?<!\/)\/+$/, '');
const VIEWPORT = { width: 1600, height: 900 };
const CDP_URL = `http://127.0.0.1:${process.env.README_CDP_PORT || 9222}`;
const GRAFANA_URL = process.env.README_GRAFANA_URL || 'https://grafana.reserve.it.kr/d/reserve-hardware';
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
        const belongs = host => AUTH_DOMAINS.includes(host.replace(/^\./, ''));
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
    const resolved = path.resolve(AUTH_DIR);
    if (path.dirname(resolved) !== path.resolve(FRONTEND_DIR) || path.basename(resolved) !== '.readme-capture')
        throw new Error('로그인 상태 저장 경로를 확인해주세요.');
    await rm(resolved, { recursive: true, force: true });
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
        await page.waitForSelector('.react-grid-layout', { timeout: 30_000 });
        await page.waitForFunction(() => document.querySelectorAll('[aria-label="Panel loading bar"]').length === 0,
            null, { timeout: 30_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(2000);
        return;
    }
    await page.waitForFunction(() => {
        return ![...document.querySelectorAll('[aria-busy="true"], .reserve-skeleton-block, .ant-skeleton')]
            .some(element => {
                const box = element.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight
                    && box.right > 0 && box.left < innerWidth;
            });
    }, null, { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => {
        const box = image.getBoundingClientRect();
        return box.width === 0 || box.height === 0 || box.bottom <= 0 || box.top >= innerHeight
            || image.complete && image.naturalWidth > 0;
    }), null, { timeout: 10_000 });
    await page.waitForTimeout(800);
}

// 이메일·전화번호를 화면에서 가린다(스크린샷에만 적용, 서버 데이터는 그대로).
async function maskPersonalText(page) {
    await page.evaluate(() => {
        const email = /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
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
        const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
        if (!response?.ok()) throw new Error('화면이 정상 응답하지 않았어요.');
        await waitReady(page, { grafana });
        if (await landedOnLogin(page)) {
            console.warn(`  ! ${name}: 로그인 화면으로 돌아갔습니다(로그인 만료·권한 없음). 이 화면은 건너뜁니다 — 기존 ${name}.png 는 그대로 남습니다.`);
            return null;
        }
        await maskPersonalText(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        // README 는 여섯 화면을 같은 크기 격자로 보여 준다 — Grafana 도 자르지 않고 같은 1600×900 으로 찍는다.
        const image = await page.screenshot({ fullPage: false, type: README_IMAGE_FILENAMES[name].endsWith('.jpg') ? 'jpeg' : 'png' });
        return (await saveImage(name, image)) ? name : null;
    } catch (error) {
        // 개별 캡처가 실패해도 회전된 토큰의 상태 저장까지 진행한다.
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

// Windows 파일 잠금은 잠시 기다린 뒤 다시 시도한다.
// 잠긴 파일은 임시 파일 교체로 저장하고 제한적으로 재시도한다.

async function saveImage(name, image) {
    const filename = README_IMAGE_FILENAMES[name];
    const target = path.join(OUTPUT_DIR, filename);
    const temp = path.join(OUTPUT_DIR, `.${filename}.tmp`);
    await writeFile(temp, image);
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        try {
            await rename(temp, target);
            return true;
        } catch (error) {
            if (attempt === 6) {
                await rm(temp, { force: true });
                console.warn(`  ! ${filename} 교체에 실패해 기존 이미지를 유지해요(${error.code}).`);
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
    }
    return false;
}

async function writeManifest(captured) {
    const manifestPath = path.join(OUTPUT_DIR, 'screenshots.json');
    const previous = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { files: [] };
    const canonical = new Set(Object.values(README_IMAGE_FILENAMES));
    const files = new Map((previous.files ?? []).filter(file => canonical.has(file.path))
        .map(file => [file.path, { ...file, viewport: file.viewport ?? previous.viewport }]));
    const entries = await Promise.all(captured.map(async name => {
        const filename = README_IMAGE_FILENAMES[name];
        const contents = await readFile(path.join(OUTPUT_DIR, filename));
        return [filename, {
            path: filename,
            viewport: readmeImageDimensions(contents),
            mimeType: filename.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
            generator: 'Playwright CLI',
            bytes: contents.byteLength,
            sha256: createHash('sha256').update(contents).digest('hex'),
            source: name === 'monitoring' ? new URL(GRAFANA_URL).origin : BASE_URL,
            capturedAt: new Date().toISOString(),
        }];
    }));
    for (const [filename, entry] of entries) files.set(filename, entry);
    const manifest = {
        schemaVersion: 3,
        purpose: 'README screenshots captured from a real site.',
        generators: ['frontend/scripts/capture-readme-live.mjs'],
        files: [...files.values()],
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

// 로그인 상태만 다루는 보조 명령(--login / --auth / --clean). 실행했으면 true.
async function runAuthCommand() {
    if (process.argv.includes('--login')) {
        await login();
        return true;
    }
    if (process.argv.includes('--auth')) {
        await importAuthFromChrome();
        return true;
    }
    if (process.argv.includes('--clean')) {
        await cleanAuth();
        return true;
    }
    return false;
}

async function captureScenes(browser, publicScenes, authScenes, hasAuth) {
    const captured = [];
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
    return captured;
}

async function main() {
    if (await runAuthCommand()) return;
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
    let captured;
    try {
        captured = await captureScenes(browser, publicScenes, authScenes, hasAuth);
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
