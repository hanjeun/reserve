import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { installReleasePreview, TICKET, account as previewAccount, store as previewStore } from '../e2e/fixtures/reservation-release-preview.js';

const flags = new Set(process.argv.slice(2));
const allowed = new Set(['--mobile', '--headless', '--verify', '--verify-overflow', '--verify-timer', '--emergency', '--quick', '--search', '--business', '--help']);
if ([...flags].some(flag => !allowed.has(flag))) throw new Error('옵션은 --mobile, --headless, --verify, --verify-overflow, --verify-timer, --emergency, --quick, --search, --business, --help만 사용할 수 있어요.');
if (flags.has('--help')) {
    console.log('npm run preview:admission -- [--mobile] [--quick] [--headless --verify] [--emergency]\nnpm run preview:admission -- --search [--business] [--mobile]\n--search는 실제 통합검색 UI에 합성 공개·본인 결과 각 3그룹을 연결하는 수동 모드예요. 공방을 입력한 뒤 Enter·검색으로 결과 선택·복귀를 확인하고, --business에서는 광고 관리·홍보 별칭을 확인해요.\n검색 모드는 새 브라우저 세션을 사용하며 실제 계정·DB·결제·외부 네트워크에 연결하지 않아요. --mobile은 PC Chrome 터치 에뮬레이션이며 실물 휴대폰 확인은 별도예요.\n검색 모드는 자동 검증 옵션과 함께 사용할 수 없어요.\n기존 재현 도구를 같은 경로에서 교체한 버전이에요. 실제 UI·합성 API를 사용하며, 브라우저를 닫으면 정상 종료해요.\n기본은 101부터 1까지 빠짐없이 진행해요(약 7분). --quick은 101→100→99→98→11→10→9→8→3→2→1 경계만 확인해요(약 1분).\n입장 후 예약 계속하기를 직접 눌러 한 줄 고정 타이머를 확인해요. 남은 시간은 감소하고 시간 숫자는 움직이지 않아요.\n대화형 창은 PC 작업 영역 안에 맞추며, 모바일도 아래 버튼까지 표시해요.\n숫자·번째 기준선과 한 줄 안내를 확인하고, 대기창은 취소·계속 버튼으로만 선택해요.\n--emergency는 합성 서비스 입장과 가게 목록 429·10초 재시도 제한을 보여줘요.\n--verify-overflow는 고정 타이머·일반 토스트 세 개·헤더 메뉴 클릭을 자동 확인해요.\n--verify-timer는 대기 순번 검사를 반복하지 않고 입장 후 타이머 경계만 확인해요.');
    process.exit(0);
}
const mobile = flags.has('--mobile');
const headless = flags.has('--headless');
const overflow = flags.has('--verify-overflow');
const timerOnly = flags.has('--verify-timer');
const verify = headless || flags.has('--verify') || overflow || timerOnly;
const emergency = flags.has('--emergency');
const searchMode = flags.has('--search');
const business = flags.has('--business');
if (business && !searchMode) throw new Error('--business는 --search와 함께 사용해주세요.');
if (searchMode && (verify || emergency || flags.has('--quick'))) throw new Error('--search는 --mobile·--business만 함께 사용할 수 있는 수동 모드예요.');
if ([overflow, timerOnly, emergency].filter(Boolean).length > 1) throw new Error('비상·타이머·overflow 시나리오는 한 번에 하나만 선택해주세요.');
const positions = timerOnly ? [] : flags.has('--quick') ? [101, 100, 99, 98, 11, 10, 9, 8, 3, 2, 1]
    : Array.from({ length: 101 }, (_, index) => 101 - index);
const baseURL = 'http://127.0.0.1:4173';
const check = expect.configure({ timeout: 15000 });
const frontend = fileURLToPath(new URL('../', import.meta.url));
let ownedServer;
let browser;
let page;
let display;
let displayContext;
let userClosed = false;
let finishing = false;
let interrupted = false;
let resolveClosed;
const closed = new Promise(resolve => { resolveClosed = resolve; });
const onClosed = () => {
    if (!finishing) {
        if (verify) process.exitCode = 1;
        else userClosed = true;
    }
    resolveClosed();
};
const interrupt = () => {
    interrupted = true;
    if (verify) process.exitCode = 1; else userClosed = true;
    void browser?.close(); resolveClosed();
};

async function ensureServer() {
    let response;
    try { response = await fetch(baseURL, { signal: AbortSignal.timeout(2000), redirect: searchMode ? 'error' : 'follow' }); }
    catch { /* Start only our own loopback dev server when no server answers. */ }
    if (response) {
        if (!response.ok || !(await response.text()).includes('/@vite/client')) {
            throw new Error('4173 포트가 RESERVE Vite 서버인지 확인해주세요. 실행 중인 서버는 종료하지 않아요.');
        }
        console.log(`${baseURL}의 기존 Vite 서버를 재사용해요.`);
        return;
    }
    const { createServer } = await import('vite');
    ownedServer = await createServer({ root: frontend, clearScreen: false,
        server: { host: '127.0.0.1', port: 4173, strictPort: true } });
    await ownedServer.listen();
    console.log(`${baseURL} · 이 프리뷰가 시작한 Vite 서버(PID ${process.pid})는 종료 시 정리해요.`);
}

async function previewViewport() {
    const requested = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
    if (headless) return requested;
    // A fixed 844px mobile viewport plus Chrome and the Windows taskbar can exceed the monitor.
    // Measure the native window before mobile emulation replaces screen.availHeight.
    displayContext = await browser.newContext({ viewport: null });
    const probe = await displayContext.newPage();
    display = await probe.evaluate(() => ({ left: screen.availLeft ?? 0, top: screen.availTop ?? 0,
        width: screen.availWidth, height: screen.availHeight,
        frameWidth: Math.max(0, outerWidth - innerWidth), frameHeight: Math.max(0, outerHeight - innerHeight) }));
    const available = { width: Math.floor(display.width - display.frameWidth - 32),
        height: Math.floor(display.height - display.frameHeight - 32) };
    assert.ok(available.width >= 320 && available.height >= 240, '미리보기 창을 표시할 PC 작업 영역이 부족해요.');
    return { width: Math.min(requested.width, available.width), height: Math.min(requested.height, available.height) };
}

async function fitPreviewWindow() {
    if (headless) return;
    const session = await page.context().newCDPSession(page);
    try {
        const { windowId } = await session.send('Browser.getWindowForTarget');
        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await session.send('Browser.setWindowBounds', { windowId, bounds: { left: display.left + 16, top: display.top + 16 } });
        const { bounds } = await session.send('Browser.getWindowBounds', { windowId });
        assert.ok(bounds.left >= display.left && bounds.top >= display.top
            && bounds.left + bounds.width <= display.left + display.width
            && bounds.top + bounds.height <= display.top + display.height,
        '미리보기 창 전체가 PC 작업 영역 안에 있어야 해요.');
    } finally { await session.detach(); }
    await displayContext.close();
    displayContext = null;
    console.log(`${mobile ? '모바일' : 'PC'} viewport ${page.viewportSize().width}×${page.viewportSize().height} · 브라우저 아래까지 PC 작업 영역 안에 표시해요.`);
}

async function visibleDialogActions(dialog) {
    await settleAncestors(dialog);
    const geometry = await dialog.evaluate(node => {
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + (viewport?.height ?? innerHeight);
        return { top, bottom, buttons: [...node.querySelectorAll('.ant-modal-footer button')].map(button => {
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return { top: rect.top, bottom: rect.bottom, reachable: button.contains(hit) };
        }) };
    });
    assert.ok(geometry.buttons.length > 0, '대기창에 명시적인 선택 버튼이 있어야 해요.');
    for (const button of geometry.buttons) {
        assert.ok(button.top >= geometry.top && button.bottom <= geometry.bottom + 1,
            '대기창 아래 버튼이 보이는 화면 안에 있어야 해요.');
        assert.equal(button.reachable, true, '대기창 아래 버튼이 다른 요소에 가려지면 안 돼요.');
    }
}

async function selectReservation() {
    await page.goto(`${baseURL}/store/81`);
    const date = await page.evaluate(() => {
        const today = new Date(); const future = new Date(today); future.setDate(today.getDate() + 1);
        return { nextMonth: future.getMonth() !== today.getMonth(), label: `${future.getMonth() + 1}월 ${future.getDate()}일` };
    });
    await page.getByRole('button', { name: '날짜 선택', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: '예약 날짜 선택' });
    if (date.nextMonth) await calendar.getByRole('button', { name: '다음 달', exact: true }).click();
    await calendar.getByRole('button', { name: date.label, exact: true }).click();
    await check(calendar).toBeHidden();
    await page.locator('.rsv-time-pill').filter({ hasText: '14:00' }).click();
    await page.getByPlaceholder('요청 사항을 입력하세요.').fill('미리보기에서 작성한 예약 내용이에요.');
    await page.getByRole('button', { name: '예약 신청하기', exact: true }).click();
    return page.getByRole('dialog', { name: '예약 입장 대기' });
}

async function settledRank(dialog, position) {
    const rank = dialog.locator('.reserve-admission-rank');
    await check(rank).toHaveAttribute('data-rank', String(position));
    await rank.evaluate(async node => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(node.getAnimations({ subtree: true }).map(motion => motion.finished.catch(() => {})));
    });
    return rank;
}

async function settleAncestors(locator) {
    await locator.evaluate(async node => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const motions = [];
        for (let parent = node; parent; parent = parent.parentElement) motions.push(...parent.getAnimations());
        await Promise.all(motions.filter(motion => Number.isFinite(motion.effect?.getComputedTiming().endTime))
            .map(motion => motion.finished.catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
}

async function explicitChoiceOnly(dialog, fixture) {
    await check(dialog).toBeVisible();
    await visibleDialogActions(dialog);
    await check(dialog.locator('.ant-modal-close')).toHaveCount(0);
    const note = dialog.locator('.reserve-admission-note');
    await check(note).toHaveText('취소해도 작성한 내용은 유지돼요.');
    const noteGeometry = await note.evaluate(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        return { lines: range.getClientRects().length, width: node.scrollWidth, available: node.clientWidth };
    });
    assert.equal(noteGeometry.lines, 1, '회색 안내는 한 줄이어야 해요.');
    assert.ok(noteGeometry.width <= noteGeometry.available, '회색 안내가 모바일 대기창을 넘으면 안 돼요.');
    const cancels = fixture.cancels;
    await page.keyboard.press('Escape');
    const box = await dialog.boundingBox();
    assert.ok(box.x > 4 || box.y > 4, '배경 클릭 지점은 대기창 밖이어야 해요.');
    await page.mouse.click(4, 4);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await check(dialog).toBeVisible();
    assert.equal(fixture.cancels, cancels, 'Esc·배경 클릭은 대기를 취소하면 안 돼요.');
    assert.equal(fixture.reservations.length, 0, '명시적 계속 전에는 예약을 전송하면 안 돼요.');
}

async function oneLineNotice(timer) {
    const geometry = await timer.evaluate(node => {
        const bar = node.closest('.reserve-reservation-entry-notice');
        const card = node.closest('.ant-message-notice');
        const rect = bar.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        return { height: rect.height, lineHeight: parseFloat(getComputedStyle(bar).lineHeight),
            whiteSpace: getComputedStyle(bar).whiteSpace, left: cardRect.left, right: cardRect.right,
            cardPointerEvents: getComputedStyle(card).pointerEvents, text: bar.textContent };
    });
    assert.equal(geometry.whiteSpace, 'nowrap');
    assert.ok(geometry.height <= geometry.lineHeight + 1, '입장 고정 안내는 한 줄이어야 해요.');
    assert.ok(geometry.left >= 0 && geometry.right <= page.viewportSize().width, '한 줄 안내가 모바일 화면을 넘으면 안 돼요.');
    assert.match(geometry.text, /^남은\d+:\d{2}· 자리 미확보$/);
    assert.equal(geometry.cardPointerEvents, 'auto', '안내 카드의 기존 포인터 관문을 유지해야 해요.');
}

async function preview(fixture) {
    const dialog = await selectReservation();
    await explicitChoiceOnly(dialog, fixture);
    let messageNode;
    let previous;
    await page.evaluate(() => document.fonts.ready);
    for (const position of positions) {
        fixture.admissionPosition = position;
        const rank = await settledRank(dialog, position);
        const geometry = await rank.evaluate(node => {
            const number = node.querySelector('.reserve-admission-rank-number');
            const suffix = node.querySelector('.reserve-admission-rank-suffix');
            const currentDigits = [...number.querySelectorAll('.reserve-rolling-field-value')].map(cell => cell.children[0]);
            const current = currentDigits[0];
            const currentText = currentDigits.map(digit => digit.textContent).join('');
            const textBox = element => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect(); };
            // Compare against one ordinary text run with the same font: this includes Korean fallback font metrics.
            const reference = document.createElement('span'); reference.textContent = `${currentText}번째`;
            Object.assign(reference.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' });
            node.parentElement.append(reference);
            const range = document.createRange();
            range.setStart(reference.firstChild, 0); range.setEnd(reference.firstChild, currentText.length);
            const referenceNumber = range.getBoundingClientRect();
            range.setStart(reference.firstChild, currentText.length); range.setEnd(reference.firstChild, reference.textContent.length);
            const referenceSuffix = range.getBoundingClientRect();
            const baselineDrift = (textBox(current).y - textBox(suffix).y) - (referenceNumber.y - referenceSuffix.y);
            reference.remove();
            const rect = node.getBoundingClientRect(); const parent = node.parentElement.getBoundingClientRect();
            return { width: number.getBoundingClientRect().width, suffixX: suffix.getBoundingClientRect().x,
                center: rect.x + rect.width / 2, parentCenter: parent.x + parent.width / 2,
                number: currentText, baselineDrift,
                suffixOutsideRoll: !suffix.closest('.reserve-rolling-field-value') };
        });
        assert.equal(geometry.number, String(position)); assert.equal(geometry.suffixOutsideRoll, true);
        assert.ok(Math.abs(geometry.baselineDrift) < 0.75, `숫자·번째 기준선 차이: ${geometry.baselineDrift}px`);
        assert.ok(Math.abs(geometry.center - geometry.parentCenter) < 1, '숫자와 접미사 묶음이 중앙에 있어야 해요.');
        if (previous && String(previous.position).length === String(position).length) {
            assert.ok(Math.abs(geometry.suffixX - previous.suffixX) < 0.75, '같은 자릿수에서 번째 위치가 바뀌면 안 돼요.');
            assert.ok(Math.abs(geometry.width - previous.width) < 0.75);
        }
        previous = { position, ...geometry };
        await check(dialog.getByRole('button', { name: '예약 계속하기' })).toBeDisabled();
        if (position <= 3) await check(dialog.getByText('곧 입장할 차례예요.', { exact: true })).toBeVisible();
        else await check(dialog.getByText('차례가 되면 예약을 계속할 수 있어요.', { exact: true })).toBeVisible();
        if (position === 101) messageNode = await dialog.getByText('차례가 되면 예약을 계속할 수 있어요.', { exact: true }).elementHandle();
        if (position === 3) assert.equal(await messageNode.evaluate(node => node.textContent), '곧 입장할 차례예요.');
        assert.equal(fixture.reservations.length, 0, '입장 대기 중 예약 쓰기가 실행되면 안 돼요.');
        console.log(`WAITING ${position} · ${position <= 3 ? '곧 입장할 차례예요.' : '일반 대기 안내'}`);
    }
    assert.deepEqual(await page.evaluate(() => window.__admissionWidthTransitions), timerOnly ? [] : ['99', '9'], '자릿수가 줄어들 때만 폭을 전환해야 해요.');
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('reserve-admission-attempts-v1'))?.attempts['release-preview']);
    assert.equal(saved.ticket, TICKET);
    fixture.admissionState = 'ADMITTED';
    await check(dialog.getByText('예약할 차례예요.', { exact: true })).toBeVisible();
    await check(dialog.getByRole('button', { name: '예약 계속하기' })).toBeEnabled();
    await explicitChoiceOnly(dialog, fixture);
    assert.equal(fixture.reservations.length, 0);
    console.log('ADMITTED · 예약은 생성하지 않았어요. 예약 계속하기를 직접 눌러주세요.');
    if (verify) await dialog.getByRole('button', { name: '예약 계속하기' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: verify ? 15000 : 0 });
    const timer = page.getByRole('timer', { name: '예약 입장 남은 시간' });
    await check(timer).toBeVisible(); await check(timer).toHaveCount(1); await check(timer).toHaveAttribute('aria-live', 'off');
    await settleAncestors(timer);
    await oneLineNotice(timer);
    const timerNode = await timer.elementHandle();
    const firstTime = await timer.textContent();
    const polls = fixture.polls;
    const notice = page.locator('.reserve-reservation-entry-notice');
    const beforeScroll = await notice.boundingBox();
    for (const bottom of [true, false]) {
        await page.evaluate(toBottom => window.scrollTo({ top: toBottom ? document.documentElement.scrollHeight : 0, behavior: 'instant' }), bottom);
        const box = await notice.boundingBox(); const viewport = page.viewportSize();
        assert.ok(box.y >= 0 && box.y + box.height <= viewport.height, '폼을 스크롤해도 타이머가 화면 안에 있어야 해요.');
        assert.ok(Math.abs(box.y - beforeScroll.y) < 1, '남은 시간은 화면에 고정되어야 해요.');
    }
    await check(timer).not.toHaveText(firstTime);
    await oneLineNotice(timer);
    assert.equal(await timerNode.evaluate(node => node.isConnected), true);
    const secondsLeft = value => value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    assert.ok(secondsLeft(await timer.textContent()) < secondsLeft(firstTime), '남은 시간은 기존 만료 시각을 향해 감소해야 해요.');
    const motions = await page.evaluate(() => window.__admissionNoticeMotions);
    assert.equal(motions.filter(motion => motion.timer).length, 0, '카운트다운 시간에는 WAAPI 모션을 사용하면 안 돼요.');
    assert.equal(fixture.polls, polls, '카운트다운만으로 상태 API를 더 호출하면 안 돼요.');
    await check(page.getByPlaceholder('요청 사항을 입력하세요.')).toHaveValue('미리보기에서 작성한 예약 내용이에요.');
    const returned = await page.evaluate(() => JSON.parse(sessionStorage.getItem('reserve-admission-attempts-v1'))?.attempts['release-preview']);
    assert.equal(returned.requestId, saved.requestId);
    assert.equal(fixture.reservations.length, 0, '폼 복귀만으로 예약을 생성하면 안 돼요.');
    assert.deepEqual(fixture.errors, []);
    console.log(timerOnly
        ? `${mobile ? '모바일' : 'PC'} 타이머 확인 완료: 입장→폼 복귀·원래 요청 번호·한 줄 고정 안내·스크롤 뒤 표시·시간 감소·시간 모션 0회, 합성 예약 쓰기 0회.`
        : `${mobile ? '모바일' : 'PC'} 확인 완료: ${positions.length}개 순번→ADMITTED→폼·한 줄 고정 타이머, 아래 버튼 표시·숫자·번째 기준선·접미사 고정·자릿수 폭 전환·순번 변경 자릿수만 down 모션·시간 모션 0회·X/Esc/배경 닫기 없음, 합성 예약 쓰기 0회.`);
    if (!verify) {
        console.log('브라우저를 닫으면 정상 종료해요. 입장 기한은 3분이며 다시 실행하면 새 상태로 시작해요.');
        await closed;
    }
}

async function previewEmergency(fixture) {
    await page.goto(`${baseURL}/stores`);
    const dialog = page.getByRole('dialog', { name: '서비스 입장 대기' });
    await settledRank(dialog, 7);
    await explicitChoiceOnly(dialog, fixture);
    assert.equal(fixture.reservations.length, 0);
    console.log('합성 EMERGENCY WAITING · 보호된 가게 목록은 아직 조회되지 않았어요.');
    fixture.serviceState = 'ADMITTED';
    await check(dialog.getByText('이어서 이용할 수 있어요.', { exact: true })).toBeVisible();
    await explicitChoiceOnly(dialog, fixture);
    if (verify) await dialog.getByRole('button', { name: '계속 이용하기', exact: true }).click();
    else console.log('서비스에 입장했어요. 계속 이용하기를 직접 눌러주세요.');
    await dialog.waitFor({ state: 'hidden', timeout: verify ? 15000 : 0 });
    const error = page.locator('.reserve-data-state--error');
    await check(error).toBeVisible();
    await check(error).toContainText('요청이 잠시 제한됐어요.');
    const calls = fixture.storeListCalls;
    console.log('가게 목록 429 · Retry-After 10초. 이 제한은 합성 응답이며 실제 부하를 만들지 않아요.');
    if (verify) {
        const retry = error.getByRole('button', { name: '다시 불러오기', exact: true });
        for (let index = 0; index < 2; index += 1) {
            await retry.click(); await check(retry).toBeEnabled();
            assert.equal(fixture.storeListCalls, calls, '제한 중 재시도 클릭을 서버로 보내면 안 돼요.');
        }
        await check.poll(() => Date.now() - fixture.storeThrottleAt, { timeout: 12000 }).toBeGreaterThanOrEqual(10200);
        await retry.click();
        await check(page.getByText('서촌 도예공방', { exact: true })).toBeVisible();
        await check(error).toHaveCount(0);
        assert.equal(fixture.storeListCalls, calls + 1);
        assert.equal(fixture.reservations.length, 0); assert.deepEqual(fixture.errors, []);
        console.log('합성 비상 보호 확인 완료: 서비스 입장→목록 429→제한 중 네트워크 재시도 0회→기한 후 조회 성공, 예약 쓰기 0회.');
    } else {
        console.log('다시 불러오기를 눌러보세요. 10초 전에는 네트워크 요청을 추가하지 않으며 기한 후 목록이 보여요. 브라우저를 닫으면 정상 종료해요.');
        await closed;
    }
}

async function previewOverflow(fixture) {
    const dialog = await selectReservation();
    await check(dialog.getByRole('button', { name: '예약 계속하기' })).toBeEnabled();
    await dialog.getByRole('button', { name: '예약 계속하기' }).click();
    await check(dialog).toBeHidden();
    const timer = page.getByRole('timer', { name: '예약 입장 남은 시간' });
    await check(timer).toBeVisible();
    const firstTimer = await timer.elementHandle();
    const favorite = page.getByRole('button', { name: /^즐겨찾기 (추가|삭제)$/ });
    for (let number = 1; number <= 3; number += 1) {
        await favorite.click();
        await check.poll(() => fixture.favoriteToggles).toBe(number);
        await check(favorite).toBeEnabled();
    }
    await check.poll(() => firstTimer.evaluate(node => node.isConnected)).toBe(false);
    await check(timer).toHaveCount(1); await check(timer).toBeVisible();
    await oneLineNotice(timer);
    const remaining = await timer.textContent();
    const [minutes, seconds] = remaining.split(':').map(Number);
    assert.ok(Math.abs((minutes * 60 + seconds) * 1000 - (fixture.admittedExpiresAt - Date.now())) < 2000,
        '복구된 메시지도 원래 입장 만료 시각을 유지해야 해요.');
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await settleAncestors(timer);
    const box = await timer.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height, `복구된 안내의 화면 위치: ${JSON.stringify(box)}`);
    await check(page.getByPlaceholder('요청 사항을 입력하세요.')).toHaveValue('미리보기에서 작성한 예약 내용이에요.');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const avatar = page.getByRole('button', { name: '내 계정 메뉴 열기', exact: true });
    await check(avatar).toBeVisible();
    await settleAncestors(avatar);
    const hit = await avatar.evaluate(node => {
        const rect = node.getBoundingClientRect(); const x = rect.x + rect.width / 2; const y = rect.y + rect.height / 2;
        const list = document.querySelector('.ant-message-list-content');
        return { x, y, hit: node.contains(document.elementFromPoint(x, y)), pointerEvents: getComputedStyle(list).pointerEvents };
    });
    assert.equal(hit.pointerEvents, 'none'); assert.equal(hit.hit, true, '일반 안내·고정 타이머가 헤더 프로필 메뉴를 가리면 안 돼요.');
    await page.mouse.click(hit.x, hit.y);
    await check(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.rsv-time-pill').filter({ hasText: '11:00' }).click();
    await check(timer).toHaveCount(0);
    await page.evaluate(() => new Promise(resolve => queueMicrotask(resolve)));
    await check(timer).toHaveCount(0);
    const joins = fixture.joins;
    const expiresAt = fixture.admittedExpiresAt;
    await page.locator('.rsv-time-pill').filter({ hasText: '14:00' }).click();
    await check(timer).toHaveCount(1); await check(timer).toBeVisible();
    await oneLineNotice(timer);
    assert.equal(fixture.joins, joins, '원래 슬롯 조회만으로 새 순번을 만들면 안 돼요.');
    assert.equal(fixture.admittedExpiresAt, expiresAt, '원래 슬롯 복귀만으로 입장 시간을 늘리면 안 돼요.');
    assert.equal(fixture.reservations.length, 0); assert.deepEqual(fixture.errors, []);
    console.log('고정 안내 overflow 확인 완료: 실제 App 토스트 3개→한 줄 타이머 단일 복구→원래 만료 시각·폼·스크롤 뒤 viewport 유지→헤더 avatar hit-test·실제 메뉴 클릭→다른 슬롯에서 종료·원래 슬롯 복귀 복원, 새 순번·추가 입장 시간·예약 쓰기 0회.');
}


const searchPreviewHeaders = route => ({
    'access-control-allow-origin': baseURL,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
    'access-control-allow-headers': route.request().headers()['access-control-request-headers'] || 'content-type',
});

async function installSearchPreview(context, fixture) {
    const account = { ...previewAccount, role: business ? 'BUSINESS' : 'USER' };
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const waiting = { storeName: previewStore.name, teamsAhead: 2, entry: {
        id: 701, storeId: previewStore.id, entryNumber: 17, status: 'WAITING', partySize: 2,
        displayName: account.name, businessDate: today, createdAt: new Date(Date.now() - 600000).toISOString(),
    } };
    const reservation = { id: 901, memberId: account.id, storeId: previewStore.id, storeName: previewStore.name,
        reservationCode: 'PREVIEW-901', memberName: account.name, reservationDate: today,
        reservationTime: '14:00:00', guestCount: 2, status: 'CONFIRMED', depositAmount: 0, depositPaid: false,
        noShowDeposit: 0, specialRequest: '합성 예약이에요. 실제 예약 내역은 사용하지 않아요.' };
    const benefit = { id: 601, title: '공방 원데이 클래스 혜택', storeId: previewStore.id, storeName: previewStore.name,
        state: 'PUBLISHED', revision: 0, content: '통합검색에서 여는 합성 혜택이에요. 실제 행사나 결제와 연결되지 않아요.',
        images: [1, 2].map(id => ({ id, url: '/api/feed/media/501', width: 960, height: 640 })), createdAt: new Date().toISOString() };
    const items = {
        stores: [{ id: 81, type: 'STORE', title: previewStore.name, description: previewStore.address, path: '/store/81' }],
        benefits: [{ id: 601, type: 'BENEFIT', title: benefit.title, description: previewStore.name, path: '/benefits/601' }],
        feed: [{ id: 501, type: 'FEED', title: '공방에서 만든 작은 그릇', description: '합성 공개 피드', path: '/feed/posts/501' }],
        reservations: [{ id: 901, type: 'RESERVATION', title: `${previewStore.name} 예약`, description: 'PREVIEW-901 · 합성 예약', path: '/my-reservations?reservationId=901' }],
        waiting: [{ id: 701, type: 'WAITING', title: `${previewStore.name} 웨이팅`, description: '17번 · 합성 웨이팅', path: '/my-reservations?tab=waiting&entryId=701' }],
        messages: [{ id: 301, type: 'MESSAGE', title: `${previewStore.name} 문의`, description: '공방 문의의 합성 메시지', path: '/messages?storeId=81' }],
    };
    const titles = { stores: '가게', benefits: '혜택', feed: '피드', reservations: '내 예약', waiting: '내 웨이팅', messages: '메시지' };
    const comparable = value => value.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('ko');
    const pageOf = content => ({ content, page: { number: 0, totalElements: content.length, totalPages: content.length ? 1 : 0 } });
    const ok = (route, data) => route.fulfill({ headers: searchPreviewHeaders(route), json: { success: true, data } });
    await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.replace(/^\/api\/v1(?=\/|$)/, '/api');
        if (!path.startsWith('/api/') && url.origin !== baseURL || /^\/(?:oauth2|login\/oauth2)(?:\/|$)/.test(url.pathname)) {
            fixture.external.push(`${request.method()} ${url.origin}${url.pathname}`);
            return route.abort('blockedbyclient');
        }
        if (!path.startsWith('/api/')) return route.fallback();
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: searchPreviewHeaders(route) });
        // Explicitly opening the synthetic conversation retains the existing chat read flow.
        const chatRead = request.method() === 'POST' && (/^\/api\/chat\/stores\/81\/open$/.test(path) || /^\/api\/chat\/rooms\/\d+\/read$/.test(path));
        if (!['GET', 'HEAD'].includes(request.method()) && !chatRead) return route.fulfill({ status: 405, headers: searchPreviewHeaders(route),
            json: { success: false, message: '검색 프리뷰에서는 합성 조회만 확인할 수 있어요.' } });
        if (path === '/api/member/me') return ok(route, account);
        if (path === '/api/search' || path === '/api/search/me') {
            const keyword = (url.searchParams.get('keyword') || '').trim();
            const limit = Number(url.searchParams.get('limit') || 5);
            if (keyword.length > 100 || /[\u0000-\u001f\u007f]/u.test(keyword) || !Number.isInteger(limit) || limit < 1 || limit > 5)
                return route.fulfill({ status: 400, headers: searchPreviewHeaders(route), json: { success: false, message: '검색어와 결과 수를 확인해주세요.' } });
            const keys = path.endsWith('/me') ? ['reservations', 'waiting', 'messages'] : ['stores', 'benefits', 'feed'];
            const needle = comparable(keyword);
            return ok(route, { keyword, groups: keys.map(key => ({ key, title: titles[key], error: null,
                items: needle ? items[key].filter(item => comparable(item.title + item.description).includes(needle)).slice(0, limit) : [], hasMore: false })) });
        }
        if (path === '/api/reservations/my/page' || path === '/api/reservations/my-reservations/page') return ok(route, pageOf([reservation]));
        if (path === '/api/reservations/901') return ok(route, reservation);
        if (path === '/api/waiting/my/701') return ok(route, waiting);
        if (path === '/api/waiting/my') return ok(route, pageOf([waiting]));
        if (path === '/api/store-news/config') return ok(route, { enabled: true, imageEnabled: true, maxImages: 6,
            maxImageBytes: 7340032, benefitEventsEnabled: false });
        if (path === '/api/promotions/public') return ok(route, pageOf([benefit]));
        if (path === '/api/promotions/public/601') return ok(route, benefit);
        // The existing context-wide fixture handles every remaining API and rejects external resources.
        return route.fallback();
    });
}

async function previewSearch() {
    await page.goto(`${baseURL}/search`);
    console.log(`통합검색 수동 프리뷰 · 합성 ${business ? 'BUSINESS' : 'USER'} · 공개 3그룹 + 본인 3그룹`);
    console.log('빈 검색은 서비스·빠른 검색·최근 검색만 보여요. 공방을 입력한 뒤 Enter/검색을 눌러 공개·본인 결과와 선택 후 복귀를 확인해주세요.');
    console.log('타이핑·지우기·한글 조합은 로컬 메뉴만 찾아요. 내가 예약한은 내 예약 메뉴를 보여주고, 단일 정확 메뉴·별칭 확정은 원격 조회를 생략해요.');
    console.log(business ? '광고 관리 또는 홍보를 검색하면 실제 사업자 광고 관리 메뉴로 이동할 수 있어요.'
        : '광고 관리 또는 홍보를 검색해도 사업자 전용 메뉴는 표시하지 않아요. --business로 비교할 수 있어요.');
    console.log('입력 지우기·취소·Esc·한글 조합·최근 검색·Ctrl/Cmd 새 탭·스크롤 복귀를 직접 확인해주세요.');
    console.log('새 탭도 같은 합성 API와 외부 차단을 사용해요. DB·PG·실제 계정 쿠키는 사용하지 않아요.');
    console.log('--mobile은 PC의 Chrome 터치 에뮬레이션이에요. 실물 휴대폰과 실제 검색·권한 API 확인은 별도예요.');
    console.log('브라우저를 닫으면 정상 종료해요.');
    await closed;
}

process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
    await ensureServer();
    if (!interrupted) {
        const chrome = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
            .filter(Boolean).map(root => join(root, 'Google/Chrome/Application/chrome.exe')).find(existsSync);
        browser = await chromium.launch({ ...(chrome ? { executablePath: chrome } : {}), headless });
        browser.on('disconnected', onClosed);
        const context = await browser.newContext({ viewport: await previewViewport(),
            isMobile: mobile, hasTouch: mobile, locale: 'ko-KR', colorScheme: 'light', reducedMotion: 'no-preference', serviceWorkers: 'block' });
        page = await context.newPage();
        page.on('close', onClosed);
        await fitPreviewWindow();
        await page.addInitScript(() => {
            window.__admissionWidthTransitions = [];
            window.__admissionNoticeMotions = [];
            const animate = Element.prototype.animate;
            Element.prototype.animate = function (frames, options) {
                if (this.closest('.reserve-reservation-entry-notice')) window.__admissionNoticeMotions.push({
                    timer: Boolean(this.closest('[role="timer"][aria-label="예약 입장 남은 시간"]')), firstFrame: frames[0],
                });
                return animate.call(this, frames, options);
            };
            document.addEventListener('transitionrun', event => {
                if (event.propertyName === 'width' && event.target.classList.contains('reserve-admission-rank-number')) {
                    window.__admissionWidthTransitions.push(event.target.parentElement.dataset.rank);
                }
            }, true);
        });
        await (searchMode ? context : page).routeWebSocket('**/*', socket => {
            const url = new URL(socket.url());
            if (['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '4173') socket.connectToServer();
            else void socket.close();
        });
        // Context routes also cover Ctrl/Cmd-opened tabs in manual search mode.
        const fixtureSurface = searchMode ? {
            addInitScript: (...args) => context.addInitScript(...args),
            route: (pattern, handler) => context.route(pattern, route => handler({
                request: () => route.request(), abort: (...args) => route.abort(...args), continue: (...args) => route.continue(...args),
                fulfill: options => route.fulfill({ ...options, headers: { ...searchPreviewHeaders(route), ...options.headers } }),
            })),
            on: (event, listener) => { page.on(event, listener); context.on('page', child => child.on(event, listener)); },
        } : page;
        const fixture = await installReleasePreview(fixtureSurface);
        if (searchMode) await installSearchPreview(context, fixture);
        fixture.admissionPosition = 101;
        if (overflow || timerOnly) fixture.admissionState = 'ADMITTED';
        if (emergency) {
            fixture.serviceMode = 'EMERGENCY'; fixture.serviceState = 'WAITING'; fixture.storeThrottleErrors = 1;
        }
        console.log('실제 RESERVE 컴포넌트 + 합성 API만 사용해요. 외부 네트워크와 실제 예약·결제 호출은 차단해요.');
        if (!searchMode) console.log(verify ? '자동 검증 중 예상하지 못한 브라우저 종료는 실패로 처리해요.'
            : `순번은 약 4초 간격으로 ${positions.length}단계 진행해요. 언제든 브라우저를 닫아도 정상 종료해요.`);
        if (searchMode) await previewSearch();
        else if (overflow) await previewOverflow(fixture);
        else if (emergency) await previewEmergency(fixture); else await preview(fixture);
    }
} catch (error) {
    if (!verify && (userClosed || page?.isClosed() || browser && !browser.isConnected())) userClosed = true;
    else {
        console.error(error.stack || error.message); process.exitCode = 1;
    }
} finally {
    finishing = true;
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    await browser?.close().catch(() => {});
    await ownedServer?.close();
    if (userClosed) console.log('미리보기 브라우저를 닫아 정상 종료했어요.');
}
