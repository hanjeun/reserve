import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const REPOSITORY_DIR = path.resolve(FRONTEND_DIR, '..');
const OUTPUT_DIR = path.join(REPOSITORY_DIR, 'docs', 'images');
const HOST = '127.0.0.1';
const PORT = 4273;
const BASE_URL = `http://${HOST}:${PORT}`;
const VIEWPORT = { width: 1600, height: 900 };
const EMPTY_PAGE = {
    content: [],
    page: { number: 0, size: 20, totalElements: 0, totalPages: 0 },
};

const STORES = [
    {
        id: 101,
        name: '샘플 커피 스튜디오',
        category: '카페',
        description: '천천히 머무르며 커피를 즐기는 합성 데이터 공간',
        mainImageUrl: 'https://assets.example.test/store-coffee.svg',
        mainImageWidth: 1200,
        mainImageHeight: 800,
        rating: 4.9,
        reviewCount: 128,
        latitude: 37.57,
        longitude: 126.98,
    },
    {
        id: 102,
        name: '테스트 웰니스 클리닉',
        category: '의료·건강',
        description: '상담 시간을 예약하는 가상의 웰니스 공간',
        mainImageUrl: 'https://assets.example.test/store-wellness.svg',
        mainImageWidth: 1200,
        mainImageHeight: 800,
        rating: 4.8,
        reviewCount: 96,
        latitude: 37.56,
        longitude: 126.99,
    },
    {
        id: 103,
        name: '데모 메이커 클래스',
        category: '교육·클래스',
        description: '소규모 워크숍을 위한 합성 예약 예시',
        mainImageUrl: 'https://assets.example.test/store-class.svg',
        mainImageWidth: 1200,
        mainImageHeight: 800,
        rating: 4.7,
        reviewCount: 74,
        latitude: 37.58,
        longitude: 127.01,
    },
    {
        id: 104,
        name: '샘플 바디 밸런스',
        category: '스포츠',
        description: '개인 레슨을 예약하는 가상의 운동 공간',
        mainImageUrl: 'https://assets.example.test/store-fitness.svg',
        mainImageWidth: 1200,
        mainImageHeight: 800,
        rating: 4.6,
        reviewCount: 52,
        latitude: 37.55,
        longitude: 127.02,
    },
];

const DETAIL_STORE = {
    ...STORES[0],
    ownerId: 700,
    description: '원두 취향과 머무를 시간을 함께 고를 수 있는 합성 데이터 기반 예약 공간입니다.',
    address: '서울 테스트구 샘플로 123',
    addressDetail: '데모빌딩 2층',
    phone: '02-0000-0000',
    detailImageUrls: [
        'https://assets.example.test/store-coffee.svg',
        'https://assets.example.test/store-coffee-detail.svg',
    ],
    openTime: '09:00:00',
    closeTime: '21:00:00',
    breakStartTime: '12:30:00',
    breakEndTime: '13:30:00',
    noShowDeposit: 10000,
    fullRefundDays: 3,
    partialRefundDays: 1,
    partialRefundRate: 50,
    bookingDeadlineHours: 1,
    paymentTimeoutMinutes: 10,
    reservationSlotMinutes: 30,
    maxCapacityPerSlot: 6,
    bookingType: 'TIME',
    status: 'ACTIVE',
};

const USERS = {
    business: {
        id: 700,
        name: '합성 사업자',
        email: 'owner@example.test',
        role: 'BUSINESS',
        termsAgreed: true,
    },
    admin: {
        id: 900,
        name: '합성 관리자',
        email: 'admin@example.test',
        role: 'ADMIN',
        termsAgreed: true,
    },
};

const pageOf = (content, totalElements = content.length, size = 20) => ({
    content,
    page: {
        number: 0,
        size,
        totalElements,
        totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size),
    },
});

const ok = (route, data) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data }),
});

const unauthorized = route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: '합성 미리보기에는 로그인 세션이 없습니다.' }),
});

const syntheticStoreImage = (title, first, second, accent) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${first}"/>
      <stop offset="1" stop-color="${second}"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-opacity=".16"/></filter>
  </defs>
  <rect width="1200" height="800" fill="url(#background)"/>
  <circle cx="1030" cy="105" r="180" fill="#fff" opacity=".12"/>
  <circle cx="130" cy="725" r="250" fill="#fff" opacity=".10"/>
  <g filter="url(#shadow)">
    <rect x="180" y="145" width="840" height="510" rx="52" fill="#fff" opacity=".92"/>
    <rect x="230" y="200" width="740" height="300" rx="34" fill="${accent}" opacity=".13"/>
    <circle cx="600" cy="350" r="112" fill="${accent}" opacity=".92"/>
    <path d="M535 350h130M600 285v130" stroke="#fff" stroke-width="28" stroke-linecap="round" opacity=".92"/>
    <rect x="280" y="555" width="640" height="18" rx="9" fill="${accent}" opacity=".24"/>
    <rect x="390" y="596" width="420" height="13" rx="7" fill="${accent}" opacity=".16"/>
  </g>
  <text x="72" y="88" font-family="Pretendard,Segoe UI,sans-serif" font-size="28" font-weight="700" fill="#fff" opacity=".96">RESERVE · SYNTHETIC PREVIEW</text>
  <text x="1128" y="752" text-anchor="end" font-family="Pretendard,Segoe UI,sans-serif" font-size="30" font-weight="800" fill="#fff" opacity=".94">${title}</text>
</svg>`;

const IMAGE_FIXTURES = new Map([
    ['/store-coffee.svg', syntheticStoreImage('COFFEE', '#2367e8', '#6eb7ff', '#2f7df4')],
    ['/store-coffee-detail.svg', syntheticStoreImage('STUDIO', '#171d2b', '#526b98', '#4d83ee')],
    ['/store-wellness.svg', syntheticStoreImage('WELLNESS', '#1d7b72', '#72d8bf', '#28a991')],
    ['/store-class.svg', syntheticStoreImage('CLASS', '#7952b3', '#d59bed', '#9d63cf')],
    ['/store-fitness.svg', syntheticStoreImage('FITNESS', '#e1693a', '#f3b15c', '#e98340')],
]);

const STORE_STATISTICS = {
    averageRating: 4.9,
    reviewCount: 128,
    totalDepositRevenue: 1840000,
    reservationTrend: [
        { date: '2026-08-25', value: 14 },
        { date: '2026-08-30', value: 22 },
        { date: '2026-09-04', value: 18 },
        { date: '2026-09-09', value: 31 },
        { date: '2026-09-14', value: 27 },
        { date: '2026-09-19', value: 36 },
    ],
    statusBreakdown: { CONFIRMED: 46, COMPLETED: 71, CANCELED: 9, NO_SHOW: 2 },
    revenueTrend: [
        { date: '2026-08-25', value: 210000 },
        { date: '2026-08-30', value: 280000 },
        { date: '2026-09-04', value: 245000 },
        { date: '2026-09-09', value: 360000 },
        { date: '2026-09-14', value: 325000 },
        { date: '2026-09-19', value: 420000 },
    ],
    adSummary: {
        adType: 'BANNER',
        daysRemaining: 12,
        impressionCount: 1240,
        clickCount: 186,
        conversionCount: 28,
        clickThroughRate: 15.0,
        conversionRate: 15.1,
    },
};

const is = expected => pathname => pathname === expected;

// API 경로별 가짜 응답 — 위에서부터 처음 맞는 규칙 하나만 쓴다.
const MOCK_ROUTES = [
    [p => p === '/api/member/me' || p === '/api/auth/refresh',
        (route, { authenticatedUser }) => (authenticatedUser ? ok(route, authenticatedUser) : unauthorized(route))],
    [p => p.endsWith('/waiting-count') || p.endsWith('/unread'), route => ok(route, 0)],
    [is('/api/notices/highlights'), route => ok(route, [])],
    [p => p === '/api/stores/regions' || p.startsWith('/api/tourism/'), route => ok(route, [])],

    [(p, { request }) => p === '/api/stores' && request.method() === 'GET',
        route => ok(route, pageOf(STORES, STORES.length, 12))],
    [is('/api/stores/101'), route => ok(route, DETAIL_STORE)],
    [is('/api/stores/my'), route => ok(route, [{ id: 701, name: '샘플 커피 스튜디오', status: 'ACTIVE' }])],
    [is('/api/stores/701/statistics'), route => ok(route, STORE_STATISTICS)],

    [is('/api/advertisements/active'), (route, { url }) => {
        const type = url.searchParams.get('type');
        return ok(route, type === 'BADGE' ? [{ id: 501, storeId: 101, adType: 'BADGE' }] : []);
    }],
    [p => /^\/api\/advertisements\/\d+\/(impression|click)$/.test(p), route => ok(route, null)],
    [is('/api/advertisements/my'), route => ok(route, pageOf([], 0))],

    [is('/api/reviews/store/101'), route => ok(route, pageOf([], 0))],
    [p => /^\/api\/favorites\/status\/\d+$/.test(p), route => ok(route, false)],
    [p => p === '/api/reservations/calendar' || p === '/api/reservations/availability', route => ok(route, [])],
    [is('/api/reservations/my/store/101/completed'), route => ok(route, [])],
    [is('/api/reservations/store'), route => ok(route, pageOf([], 0, 15))],

    [is('/api/business-verification/admin/list'), route => ok(route, pageOf([], 18, 1))],
    [is('/api/reservations/store/status-summary'), route => ok(route, {
        total: 128,
        statusCounts: { PENDING: 12, CONFIRMED: 43, COMPLETED: 61, CANCELED: 10, NO_SHOW: 2 },
    })],
    [is('/api/admin/trash'), route => ok(route, pageOf([
        { id: 1, entityType: 'RESERVATION', action: 'SOFT_DELETE' },
        { id: 2, entityType: 'STORE', action: 'SOFT_DELETE' },
        { id: 3, entityType: 'REVIEW', action: 'SOFT_DELETE' },
        { id: 4, entityType: 'RESERVATION', action: 'SOFT_DELETE' },
    ], 6, 50))],
    [is('/api/admin/audit-logs'), route => ok(route, pageOf([
        { id: 11, action: 'SOFT_DELETE', entityType: 'RESERVATION' },
        { id: 12, action: 'RESTORE', entityType: 'STORE' },
        { id: 13, action: 'SOFT_DELETE', entityType: 'REVIEW' },
        { id: 14, action: 'HARD_DELETE', entityType: 'SENT_MAIL' },
        { id: 15, action: 'RESTORE', entityType: 'RESERVATION' },
    ], 342, 50))],

    [p => /^\/api\/chat\/rooms\/\d+\/(messages|read)$/.test(p), route => ok(route, [])],
];

async function mockApi(route, authenticatedUser) {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) return route.continue();

    const context = { request, url, authenticatedUser };
    const matched = MOCK_ROUTES.find(([matches]) => matches(pathname, context));
    return matched ? matched[1](route, context) : ok(route, EMPTY_PAGE);
}

async function waitForServer(processHandle) {
    const deadline = Date.now() + 120_000;
    let lastError;
    while (Date.now() < deadline) {
        if (processHandle.exitCode != null) {
            throw new Error(`Vite exited before becoming ready (exit ${processHandle.exitCode}).`);
        }
        try {
            const response = await fetch(BASE_URL);
            if (response.ok) return;
        } catch (error) {
            lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${BASE_URL}: ${lastError?.message ?? 'no response'}`);
}

function startVite() {
    const viteEntry = path.join(FRONTEND_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
    const child = spawn(process.execPath, [
        viteEntry,
        '--host', HOST,
        '--port', String(PORT),
        '--strictPort',
    ], {
        cwd: FRONTEND_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    const diagnostics = [];
    const remember = chunk => {
        const value = String(chunk).trim();
        if (value) diagnostics.push(value);
        if (diagnostics.length > 20) diagnostics.shift();
    };
    child.stdout.on('data', remember);
    child.stderr.on('data', remember);
    child.diagnostics = diagnostics;
    return child;
}

async function stopVite(child) {
    if (!child || child.exitCode != null) return;
    child.kill('SIGTERM');
    await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode == null) child.kill('SIGKILL');
}

async function createScenePage(browser, authenticatedUser = null) {
    const context = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: 'light',
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    await page.route('https://assets.example.test/**', route => {
        const pathname = new URL(route.request().url()).pathname;
        const body = IMAGE_FIXTURES.get(pathname);
        if (!body) return route.abort('failed');
        return route.fulfill({ status: 200, contentType: 'image/svg+xml', body });
    });
    await page.route('**/api/**', route => mockApi(route, authenticatedUser));
    return { context, page };
}

async function settle(page) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every(image => image.complete), null, { timeout: 5_000 })
        .catch(() => {});
    await page.waitForTimeout(200);
}

async function assertSyntheticVisibleText(page, scene) {
    const text = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const visible = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const value = node.textContent?.trim();
            if (!value) continue;
            const parent = node.parentElement;
            if (!parent) continue;
            const style = getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
            visible.push(value);
        }
        return visible.join('\n');
    });
    const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    const unsafeEmails = emails.filter(email => !email.toLowerCase().endsWith('@example.test'));
    if (unsafeEmails.length > 0) {
        throw new Error(`${scene} exposed a non-synthetic email: ${unsafeEmails.join(', ')}`);
    }
    if (/hanjeun|naver\.com|gmail\.com/i.test(text)) {
        throw new Error(`${scene} exposed a blocked real-data marker.`);
    }
    if (/\b(?:undefined|NaN)\b/i.test(text)) {
        throw new Error(`${scene} exposed an unresolved synthetic value.`);
    }
}

async function captureAppScene(browser, { name, pathname, user, ready }) {
    const { context, page } = await createScenePage(browser, user);
    try {
        console.log(`Capturing ${name}...`);
        // Messenger notifications and query refreshes can keep the app intentionally active.
        // The scene-specific readiness assertion below is the deterministic capture gate.
        await page.goto(`${BASE_URL}${pathname}`, { waitUntil: 'domcontentloaded' });
        await ready(page);
        await settle(page);
        await assertSyntheticVisibleText(page, name);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: false });
    } finally {
        await context.close();
    }
}

const sharedStaticStyles = `
  :root { color-scheme: light; font-family: Pretendard, "Segoe UI", sans-serif; color: #152036; background: #f5f7fb; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 1600px; height: 900px; overflow: hidden; background: #f5f7fb; }
  .canvas { width: 1600px; height: 900px; padding: 40px 48px; }
  .eyebrow { color: #377df3; font-size: 14px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  h1 { margin: 10px 0 0; font-size: 34px; letter-spacing: -.04em; }
  .notice { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; border: 1px solid #b9d1ff; border-radius: 999px; padding: 8px 13px; color: #225fc8; background: #edf4ff; font-size: 13px; font-weight: 700; }
`;

function monitoringHtml() {
    const logs = [
        ['12:04:31', 'INFO', 'req-demo-0001', 'GET /api/stores · 200 · 142ms'],
        ['12:04:27', 'INFO', 'req-demo-0002', 'POST /api/reservations · 201 · 221ms'],
        ['12:04:18', 'WARN', 'req-demo-0003', 'rate limit threshold 70% · synthetic'],
        ['12:04:05', 'INFO', 'req-demo-0004', 'GET /actuator/health · 200 · 12ms'],
        ['12:03:56', 'INFO', 'req-demo-0005', 'payment recovery check · 0 pending'],
    ];
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      ${sharedStaticStyles}
      .top { display: flex; justify-content: space-between; align-items: flex-start; }
      .range { padding: 11px 15px; border-radius: 12px; background: #fff; border: 1px solid #dfe5ef; color: #687386; font-weight: 700; }
      .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 28px 0 18px; }
      .stat { background: #fff; border: 1px solid #e1e6ef; border-radius: 18px; padding: 18px 20px; box-shadow: 0 12px 30px rgba(34,55,91,.06); }
      .stat-label { color: #778397; font-size: 13px; font-weight: 700; }
      .stat-value { margin-top: 7px; font-size: 27px; font-weight: 850; letter-spacing: -.03em; }
      .stat-note { margin-top: 5px; color: #2f8f69; font-size: 12px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1.35fr .85fr; gap: 18px; }
      .panel { background: #111826; color: #e8eef9; border-radius: 20px; padding: 22px; box-shadow: 0 16px 38px rgba(17,24,38,.14); }
      .panel h2 { margin: 0 0 5px; font-size: 18px; }
      .sub { color: #8491a6; font-size: 12px; }
      .chart { position: relative; height: 222px; margin-top: 18px; border-left: 1px solid #303b4f; border-bottom: 1px solid #303b4f;
        background: repeating-linear-gradient(to bottom, transparent, transparent 54px, #253044 55px); }
      .chart svg { position: absolute; inset: 10px 0 0 0; width: 100%; height: 200px; }
      .legend { display: flex; gap: 18px; color: #9aa7ba; font-size: 12px; margin-top: 12px; }
      .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; margin-right: 6px; }
      .health { display: grid; gap: 10px; margin-top: 18px; }
      .service { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding: 14px; background: #182233; border: 1px solid #2a374c; border-radius: 13px; }
      .service small { grid-column: 1 / -1; color: #7f8da3; }
      .ok { color: #62d8a5; font-weight: 800; }
      .logs { grid-column: 1 / -1; }
      .log-row { display: grid; grid-template-columns: 78px 58px 128px 1fr; gap: 12px; align-items: center; padding: 11px 0; border-bottom: 1px solid #273247; font: 13px/1.35 Consolas, monospace; }
      .log-row:last-child { border-bottom: 0; }
      .level { color: #62d8a5; font-weight: 800; }
      .level.warn { color: #f6bd5a; }
      .muted { color: #7f8da3; }
    </style></head><body><main class="canvas">
      <div class="top"><div><div class="eyebrow">RESERVE OBSERVABILITY</div><h1>서비스 모니터링</h1><div class="notice">● 합성 데이터 미리보기 · 운영 증거 아님</div></div><div class="range">최근 30분 · 고정 샘플</div></div>
      <section class="stats">
        <div class="stat"><div class="stat-label">요청 성공률</div><div class="stat-value">99.8%</div><div class="stat-note">정상 범위 · synthetic</div></div>
        <div class="stat"><div class="stat-label">API p95</div><div class="stat-value">184 ms</div><div class="stat-note">목표 300 ms 이하</div></div>
        <div class="stat"><div class="stat-label">오류율</div><div class="stat-value">0.2%</div><div class="stat-note">예시 값</div></div>
        <div class="stat"><div class="stat-label">로그 이벤트</div><div class="stat-value">12.4k</div><div class="stat-note">고정 합성 시계열</div></div>
      </section>
      <section class="grid">
        <article class="panel"><h2>API 지연 시간</h2><div class="sub">합성 p50 / p95 시계열</div><div class="chart"><svg viewBox="0 0 850 200" preserveAspectRatio="none"><path d="M0 138 C80 142,110 112,170 120 S270 132,330 90 S430 112,490 80 S590 98,650 58 S760 78,850 42" fill="none" stroke="#67a1ff" stroke-width="5"/><path d="M0 170 C100 162,150 170,230 148 S340 164,410 142 S510 158,580 130 S700 144,850 118" fill="none" stroke="#5bd6a5" stroke-width="4"/></svg></div><div class="legend"><span><i class="dot" style="background:#67a1ff"></i>p95</span><span><i class="dot" style="background:#5bd6a5"></i>p50</span></div></article>
        <article class="panel"><h2>서비스 상태</h2><div class="sub">고정 합성 health 결과</div><div class="health"><div class="service"><b>Nginx edge</b><span class="ok">정상</span><small>단일 전환 라우트</small></div><div class="service"><b>Spring Blue/Green</b><span class="ok">정상</span><small>비활성 후보 health 확인</small></div><div class="service"><b>MySQL</b><span class="ok">정상</span><small>읽기/쓰기 샘플</small></div></div></article>
        <article class="panel logs"><h2>애플리케이션 로그</h2><div class="sub">실제 계정·IP·주문 식별자를 포함하지 않는 고정 샘플</div>${logs.map(([time, level, id, message]) => `<div class="log-row"><span class="muted">${time}</span><span class="level ${level === 'WARN' ? 'warn' : ''}">${level}</span><span class="muted">${id}</span><span>${message}</span></div>`).join('')}</article>
      </section>
    </main></body></html>`;
}

async function captureStaticScene(browser, name, html) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    try {
        await page.setContent(html, { waitUntil: 'load' });
        await settle(page);
        await assertSyntheticVisibleText(page, name);
        await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: false });
    } finally {
        await context.close();
    }
}

async function writeManifest(names) {
    const files = [];
    for (const name of names) {
        const filename = `${name}.png`;
        const contents = await readFile(path.join(OUTPUT_DIR, filename));
        files.push({
            path: filename,
            bytes: contents.byteLength,
            sha256: createHash('sha256').update(contents).digest('hex'),
        });
    }
    const manifest = {
        schemaVersion: 1,
        purpose: 'README images generated from the local v2.6 candidate with fixed synthetic data',
        productionEvidence: false,
        realCredentialsUsed: false,
        realCustomerDataUsed: false,
        viewport: VIEWPORT,
        generator: 'frontend/scripts/generate-readme-assets.mjs',
        files,
    };
    await writeFile(path.join(OUTPUT_DIR, 'screenshots.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const server = startVite();
    let browser;
    try {
        await waitForServer(server);
        browser = await chromium.launch({ headless: true });
        await captureAppScene(browser, {
            name: 'home', pathname: '/', user: null,
            ready: page => page.getByRole('heading', { level: 1 }).first().waitFor(),
        });
        await captureAppScene(browser, {
            name: 'stores', pathname: '/stores', user: null,
            ready: page => page.getByText('샘플 커피 스튜디오', { exact: true }).first().waitFor(),
        });
        await captureAppScene(browser, {
            name: 'store-detail', pathname: '/store/101', user: null,
            ready: page => page.getByText('샘플 커피 스튜디오', { exact: true }).first().waitFor(),
        });
        await captureAppScene(browser, {
            name: 'business', pathname: '/business?tab=analytics', user: USERS.business,
            ready: page => page.getByText('1,840,000', { exact: true }).waitFor(),
        });
        await captureAppScene(browser, {
            name: 'admin', pathname: '/admin?tab=dashboard', user: USERS.admin,
            ready: page => page.getByText('128', { exact: true }).waitFor(),
        });
        await captureStaticScene(browser, 'monitoring', monitoringHtml());
        // 아키텍처 그림은 생성하지 않는다 — README·architecture.md 는 사람이 피그마로 그린
        // docs/images/RESERVE_Architecture.png 를 쓴다(2026-09-28 사용자 결정).
        await writeManifest(['home', 'stores', 'store-detail', 'business', 'admin', 'monitoring']);
        console.log(`Generated 6 synthetic README images in ${OUTPUT_DIR}`);
    } catch (error) {
        const diagnostics = server.diagnostics?.join('\n');
        if (diagnostics) console.error(diagnostics);
        throw error;
    } finally {
        await browser?.close();
        await stopVite(server);
    }
}

await main();
