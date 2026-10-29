import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';
import { expect } from '@playwright/test';
import { createServer } from 'vite';
import { installAccountSecurityPreview, SECURITY_SCENARIOS, scenarioPath } from '../e2e/fixtures/account-security-preview.js';

const args = process.argv.slice(2);
const allowed = /^(--capture|--check|--dark|--mobile|--headless|--help|--scenario=[a-z,]+)$/;
if (args.some(value => !allowed.test(value))) throw new Error('지원하지 않는 미리보기 옵션이에요.');
if (args.includes('--help')) {
    console.log('node scripts/preview-account-security.mjs [--mobile] [--scenario=enroll]');
    console.log('--capture는 합성 화면을 저장하고, --check는 캡처 없이 검사해요. --dark는 다크 테마예요.');
    console.log('시나리오: ' + SECURITY_SCENARIOS.map(value => value[0]).join(', '));
    console.log('모든 API·QR·코드·결제는 합성이며 실제 계정·PG와 연결하지 않아요. 인증 앱 코드는 123456이에요.');
    process.exit(0);
}
const capture = args.includes('--capture');
const automated = capture || args.includes('--check');
const dark = args.includes('--dark');
const mobile = args.includes('--mobile');
const headless = automated || args.includes('--headless');
const selected = args.find(value => value.startsWith('--scenario='))?.slice(11).split(',');
if (selected?.some(value => !SECURITY_SCENARIOS.some(([id]) => id === value))) throw new Error('시나리오 이름을 확인해주세요.');
const modes = selected || SECURITY_SCENARIOS.map(([id]) => id);
const origin = 'http://localhost:4177';
const frontend = fileURLToPath(new URL('../', import.meta.url));
const output = join(frontend, 'test-results', 'security-preview');
const check = expect.configure({ timeout: 20000 });
process.env.VITE_SENTRY_DSN = '';
process.env.VITE_PORTONE_TOSS_CHANNEL_KEY = 'channel-key-11111111-1111-4111-8111-111111111111';
process.env.VITE_PORTONE_CHANNEL_KEY = 'channel-key-22222222-2222-4222-8222-222222222222';
process.env.VITE_PORTONE_TOSSPAY_CHANNEL_KEY = 'channel-key-33333333-3333-4333-8333-333333333333';
process.env.VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS = '';
process.env.VITE_PORTONE_PAYMENT_ENV = 'TEST';
process.env.VITE_PORTONE_TOSS_TEST_EASY_PAY_PROVIDERS = 'NAVERPAY,SAMSUNGPAY,APPLEPAY';
const server = await createServer({ root: frontend, cacheDir: 'node_modules/.vite-security-preview', logLevel: 'error', clearScreen: false,
    server: { host: 'localhost', port: 4177, strictPort: true },
    optimizeDeps: { exclude: ['@portone/browser-sdk/v2'] },
    plugins: [{ name: 'reserve-synthetic-payment', enforce: 'pre',
        resolveId(id) { if (id === '@portone/browser-sdk/v2') return '\0reserve-synthetic-payment'; },
        load(id) { if (id === '\0reserve-synthetic-payment') return 'globalThis.__reserveSyntheticPaymentSdk = true; export default { requestPayment: async request => { globalThis.__reserveSyntheticPaymentCount = (globalThis.__reserveSyntheticPaymentCount || 0) + 1; return { paymentId: request.paymentId }; } };'; },
    }],
});
let browser;
let closing = false;
const cleanup = async () => {
    if (closing) return;
    closing = true;
    await browser?.close().catch(() => {});
    await server.close();
};
process.once('SIGINT', () => { void cleanup(); });
process.once('SIGTERM', () => { void cleanup(); });

async function toolbar(page) {
    await page.evaluate(scenarios => {
        if (document.getElementById('reserve-synthetic-controls')) return;
        const container = document.createElement('aside');
        container.id = 'reserve-synthetic-controls';
        container.setAttribute('aria-label', '합성 미리보기 제어');
        Object.assign(container.style, { position: 'fixed', left: '8px', bottom: '8px', zIndex: '2147483647',
            padding: '8px 12px', background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: '12px', fontSize: '12px' });
        const label = document.createElement('label'); label.textContent = '합성 화면 · ';
        const select = document.createElement('select'); select.setAttribute('aria-label', '미리보기 화면');
        for (const [value, text, path] of scenarios) { const option = document.createElement('option'); option.value = value; option.textContent = text; option.dataset.path = path; select.append(option); }
        select.value = new URL(location.href).searchParams.get('preview') || 'enroll';
        select.addEventListener('change', () => {
            location.href = select.selectedOptions[0].dataset.path;
        });
        label.append(select); container.append(label); document.body.append(container);
    }, SECURITY_SCENARIOS.map(([id, label]) => [id, label, scenarioPath(id)]));
}

async function prepare(page, mode, inspectMessenger) {
    if (mode === 'profile') {
        const photo = page.getByRole('button', { name: '프로필 사진 변경', exact: true });
        await check(photo).toBeVisible();
        await check(photo.locator('.anticon-user')).toBeVisible();
        await check(photo.locator('img')).toHaveCount(0);
        const shape = await photo.locator(':scope > div').evaluate(node => ({ radius: getComputedStyle(node).borderRadius,
            background: getComputedStyle(node).backgroundColor }));
        assert.equal(shape.radius, '50%'); assert.equal(shape.background, 'rgba(0, 0, 0, 0)');
        return;
    }
    if (mode === 'signup') {
        const title = page.getByRole('heading', { name: '회원가입', exact: true });
        await check(title).toBeVisible(); assert.equal((await title.innerText()).trim(), '');
        assert.ok(await page.locator('form input[type="checkbox"]').count() >= 3, '가입 약관은 유지해야 해요.');
        await check(page.locator('form button[type="submit"]')).toBeDisabled();
        return;
    }
    if (mode === 'news') {
        await check(page.locator('.reserve-benefit-row')).toHaveCount(3);
        const contrasts = await page.locator('.reserve-benefit-row--photo, .reserve-benefit-row--compact').evaluateAll(rows => {
            const light = color => {
                const channels = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255)
                    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
                return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
            };
            return rows.flatMap(row => {
                const background = light(getComputedStyle(row).backgroundColor);
                return [...row.querySelectorAll('.reserve-benefit-description, .reserve-benefit-store, .reserve-benefit-title-badge')].map(node => {
                    const foreground = light(getComputedStyle(node).color);
                    return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05);
                });
            });
        });
        assert.ok(contrasts.length === 6 && contrasts.every(value => value >= 4.5), '혜택 글자는 배경과 4.5:1 이상 대비해야 해요.');
        await page.getByRole('button', { name: '가게 소식 작성', exact: true }).click();
        const fields = page.locator('.reserve-store-news-selectors');
        await check(fields.getByRole('combobox')).toHaveCount(2);
        const aligned = await fields.evaluate(node => {
            const [a, b] = [...node.children].map(child => child.getBoundingClientRect());
            return Math.abs(a.width - b.width) < 1 && (innerWidth > 575 ? Math.abs(a.top - b.top) < 1 : b.top >= a.bottom - 1);
        });
        assert.ok(aligned, '가게와 종류는 PC 두 열·모바일 한 열을 사용해야 해요.');
        await check(fields.getByRole('combobox', { name: '소식을 올릴 내 가게' })).toBeEnabled();
        await check(fields.getByRole('combobox', { name: '가게 소식 종류' })).toBeEnabled();
        return;
    }
    if (mode === 'login') { await check(page.getByRole('button', { name: '패스키로 로그인', exact: true })).toBeVisible(); return; }
    if (['settlement', 'settlementoff'].includes(mode)) {
        await check(page.getByRole('region', { name: 'TEST 가상 정산' })).toBeVisible();
        await check(page.getByText(mode === 'settlement' ? 'DEMO-NOSHOW' : 'TEST 가상 정산을 준비하고 있어요.', { exact: true })).toBeVisible();
        return;
    }
    if (mode === 'messenger') {
        await page.getByRole('button', { name: '메시지 열기', exact: true }).click();
        await check(page.getByRole('dialog', { name: '메시지', exact: true })).toBeVisible();
        if (inspectMessenger) await inspectMessenger();
        await check(page.getByRole('button', { name: '고객지원에 문의', exact: true })).toBeVisible();
        return;
    }
    if (mode === 'payment') {
        await page.getByRole('button', { name: /결제하기$/ }).first().click();
        await check(page.getByRole('dialog', { name: '예약 및 결제 확인' })).toBeVisible();
        return;
    }
    if (['settings', 'manage', 'optional', 'unregistered'].includes(mode)) {
        const section = page.getByRole('region', { name: '패스키 및 인증 앱' });
        await check(section).toBeVisible();
        await section.scrollIntoViewIfNeeded();
        if (['manage', 'optional'].includes(mode)) {
            await section.getByRole('button', { name: '추가 인증 관리' }).click();
            await section.getByLabel('인증 앱 코드').fill('123456');
            await section.getByRole('button', { name: '확인', exact: true }).click();
            await check(section.getByRole('button', { name: '복구코드 재발급' })).toBeVisible();
        }
        return;
    }
    const flow = page.getByRole('region', { name: '추가 인증' });
    await check(flow).toBeVisible();
    if (['totp', 'codes'].includes(mode)) {
        await flow.getByRole('button', { name: '인증 앱 연결' }).click();
        await check(flow.getByLabel('인증 앱 코드')).toBeVisible();
        if (mode === 'codes') {
            await flow.getByLabel('인증 앱 코드').fill('123456');
            await flow.getByRole('button', { name: '등록', exact: true }).click();
            await check(flow.getByRole('list', { name: '복구코드' })).toBeVisible();
        }
    }
    if (mode === 'backup') await flow.getByRole('button', { name: '복구코드 사용' }).click();
}

try {
    await server.listen();
    browser = await chromium.launch({ headless, ...(headless ? {} : { channel: 'chrome' }) });
    let viewport = mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 };
    if (!headless) {
        const probe = await browser.newContext({ viewport: null }); const tab = await probe.newPage();
        const available = await tab.evaluate(() => ({ width: screen.availWidth - 48,
            height: screen.availHeight - Math.max(0, outerHeight - innerHeight) - 48 }));
        viewport = { width: Math.min(viewport.width, available.width), height: Math.min(viewport.height, available.height) };
        await probe.close();
    }
    const context = await browser.newContext({ ...(mobile ? devices['iPhone 13'] : {}), viewport,
        locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: capture ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    const fixture = await installAccountSecurityPreview(page, origin, { theme: dark ? 'dark' : 'light' });
    const consoleErrors = [];
    let expectedProofRejections = 0;
    page.on('console', event => {
        const location = event.location().url;
        if (event.type() === 'error' && /Failed to load resource:.*400/.test(event.text())
                && /\/api\/(?:v1\/)?auth\/mfa\/verify$/.test(location)) { expectedProofRejections += 1; return; }
        if (event.type() === 'error' || event.type() === 'warning') consoleErrors.push(event.text().slice(0, 280));
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal',
        hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    if (modes.includes('login') && !modes.includes('enroll')) {
        const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
        await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { credentialId: randomBytes(32).toString('base64'),
            isResidentCredential: true, rpId: 'localhost', privateKey: key.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
            userHandle: Buffer.from('reserve-demo-member-41').toString('base64'), signCount: 0, userName: 'preview@example.test' } });
    }
    const screenshot = async (name, target) => {
        if (!capture) return;
        await target.evaluate(async node => { await document.fonts.ready; await Promise.all(node.getAnimations({ subtree: true })
            .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))); });
        await target.screenshot({ path: join(output, name + (mobile ? '-mobile' : '') + '.png') });
    };
    if (automated) {
        if (capture) await mkdir(output, { recursive: true });
        for (const mode of modes) {
            let releaseMessenger;
            const messengerGate = new Promise(resolve => { releaseMessenger = resolve; });
            const messengerPattern = '**/src/components/chat/MessengerContent.jsx*';
            if (mode === 'messenger') await page.route(messengerPattern, async route => { await messengerGate; await route.continue(); });
            await page.goto(origin + scenarioPath(mode));
            try {
                await prepare(page, mode, mode === 'messenger' ? async () => {
                    const panel = page.getByRole('dialog', { name: '메시지', exact: true });
                    await check(panel.getByLabel('메신저를 불러오는 중')).toBeVisible();
                    assert.equal(await panel.locator('.reserve-messenger-skeleton-row').count(), 0);
                    const contained = await panel.evaluate(node => {
                        const shell = node.getBoundingClientRect();
                        return [...node.querySelectorAll('.reserve-skeleton-block')].every(bone => {
                            const rect = bone.getBoundingClientRect();
                            return rect.left >= shell.left - 1 && rect.right <= shell.right + 1 && rect.top >= shell.top - 1 && rect.bottom <= shell.bottom + 1;
                        });
                    });
                    assert.ok(contained, '첫 로딩 골격은 메시지 패널 안에 있어야 해요.');
                    await screenshot('messenger-loading', panel);
                    releaseMessenger();
                } : undefined);
            } finally { releaseMessenger(); if (mode === 'messenger') await page.unroute(messengerPattern); }
            const target = mode === 'profile' ? page.getByRole('button', { name: '프로필 사진 변경', exact: true })
                : mode === 'news' ? page.getByRole('dialog', { name: '새 가게 소식', exact: true })
                : mode === 'signup' ? page.locator('.reserve-page-container')
                : mode === 'login' ? page.locator('.reserve-page-container')
                : ['settlement', 'settlementoff'].includes(mode) ? page.getByRole('region', { name: 'TEST 가상 정산' })
                    : mode === 'messenger' ? page.getByRole('dialog', { name: '메시지', exact: true })
                : mode === 'payment' ? page.getByRole('dialog', { name: '예약 및 결제 확인' })
                : ['settings', 'manage', 'optional', 'unregistered'].includes(mode) ? page.getByRole('region', { name: '패스키 및 인증 앱' })
                    : page.getByRole('region', { name: '추가 인증' });
            await screenshot(mode, target);
            if (mode === 'login') {
                const fit = await page.locator('.reserve-login-actions button').evaluateAll(buttons => {
                    const rects = buttons.map(button => button.getBoundingClientRect());
                    return rects.length === 2 && Math.abs(rects[0].width - rects[1].width) < 1 && Math.abs(rects[0].top - rects[1].top) < 1
                        && buttons.every(button => button.scrollWidth <= button.clientWidth + 1);
                });
                assert.ok(fit, '로그인 버튼 두 개는 같은 줄에서 같은 폭으로 표시해야 해요.');
                await target.getByRole('checkbox', { name: '로그인 유지' }).click();
                await check(page.getByRole('dialog', { name: '로그인 유지', exact: true })).toBeVisible();
                await check(page.getByText(/14일간 접속하지 않거나 로그인 후 최대 30일/)).toBeVisible();
                const notice = page.getByRole('dialog', { name: '로그인 유지', exact: true });
                const fitsViewport = await notice.locator('.ant-modal-footer button').evaluateAll(buttons => buttons.every(button => {
                    const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
                }));
                assert.ok(fitsViewport, '로그인 유지 안내의 버튼은 화면 안에서 눌릴 수 있어야 해요.');
                await screenshot('remember-login', notice);
                await page.getByRole('button', { name: '로그인 유지하기', exact: true }).click();
                await check(target.getByRole('checkbox', { name: '로그인 유지' })).toBeChecked();
                if (!mobile) {
                    await target.getByRole('button', { name: '패스키로 로그인', exact: true }).click();
                    await page.waitForURL(url => url.pathname !== '/login');
                    assert.equal(fixture.state.verified, true, '패스키 버튼에서 브라우저 인증 후 바로 로그인해야 해요.');
                }
            }
            if (mode === 'settlement') {
                const enabled = target.getByRole('button', { name: '모의 지급', exact: true }).filter({ visible: true });
                await enabled.first().click();
                await check(enabled.first()).toBeDisabled();
                assert.equal(fixture.state.simulated, true);
            }
            if (mode === 'enroll') {
                await check(page.getByRole('heading', { name: '패스키 등록하기', exact: true })).toHaveCount(1);
                const fit = await target.locator('.reserve-login-actions button').evaluateAll(buttons => {
                    const [a, b] = buttons.map(button => button.getBoundingClientRect());
                    return buttons.length === 2 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1
                        && buttons.every(button => button.scrollWidth <= button.clientWidth + 1);
                });
                assert.ok(fit, '두 등록 방법은 같은 줄에서 같은 폭으로 표시해야 해요.');
            }
            if (mode === 'enroll' && !mobile) {
                await target.getByRole('button', { name: '패스키 추가' }).click();
                await check(target.getByRole('list', { name: '복구코드' })).toBeVisible();
                await screenshot('passkey-complete', target);
            }
            if (mode === 'verify' && !mobile) {
                await target.getByLabel('인증 앱 코드').fill('000000');
                await target.getByRole('button', { name: '확인', exact: true }).click();
                await check(target.getByRole('alert')).toBeVisible();
                await screenshot('verify-error', target);
                assert.equal(expectedProofRejections, 1, '계획한 잘못된 인증 요청만 한 번 거부해야 해요.');

            }
            if (mode === 'payment') {
                await check(target.getByRole('button', { name: '카드결제', exact: true })).toHaveAttribute('aria-pressed', 'true');
                await target.getByRole('button', { name: '신한', exact: true }).click();
                await check(target.getByRole('button', { name: '10,000원 결제하기', exact: true })).toBeEnabled();
                await target.getByRole('button', { name: '카카오페이', exact: true }).click();
                await screenshot('payment-easy', target);
                const buttonsFit = await target.locator('.ant-modal-footer button').evaluateAll(buttons => buttons.every(button => {
                    const rect = button.getBoundingClientRect(); return rect.bottom <= innerHeight + 1 && rect.top >= 0;
                }));
                assert.ok(buttonsFit, '결제 모달 하단 버튼이 화면 안에 있어야 해요.');
                if (!mobile) {
                    assert.equal(await page.evaluate(() => globalThis.__reserveSyntheticPaymentSdk), true, '합성 SDK만 사용할 수 있어요.');
                    await target.getByRole('button', { name: '10,000원 결제하기', exact: true }).click();
                    await page.waitForURL(url => url.pathname === '/payment/result' && url.searchParams.get('success') === 'true');
                    assert.equal(await page.evaluate(() => globalThis.__reserveSyntheticPaymentCount), 1);
                }
            }
            assert.deepEqual(fixture.errors, [], '화면 실행 오류가 없어야 해요.');
            assert.deepEqual(consoleErrors, [], '화면 콘솔 경고·오류가 없어야 해요. 차단 경로: ' + JSON.stringify(fixture.external));
            console.log('UI checked: ' + mode + (mobile ? ' (mobile emulation)' : ' (PC)'));
        }
        assert.deepEqual(fixture.errors, [], '화면 실행 오류가 없어야 해요.');
        assert.deepEqual(consoleErrors, [], '추가한 화면에서 콘솔 경고·오류가 없어야 해요.');
        assert.equal(fixture.external.length, 0, '합성 미리보기는 외부 요청을 보내지 않아요.');
        console.log(capture ? 'Synthetic UI captures saved: ' + output : 'Synthetic UI checks passed without captures');
    } else {
        page.on('domcontentloaded', () => {
            const mode = new URL(page.url()).searchParams.get('preview') || 'enroll';
            void prepare(page, mode).then(() => toolbar(page)).catch(error => { if (!page.isClosed() && browser.isConnected()) console.error('Preview setup failed: ' + error.message); });
        });
        await page.goto(origin + scenarioPath(modes[0]));
        console.log('합성 인증·결제 미리보기를 열었어요. 왼쪽 아래에서 화면을 선택하고, 창을 닫으면 종료해요.');
        await new Promise(resolve => browser.once('disconnected', resolve));
    }
} finally { await cleanup(); }
