import { test, expect } from '@playwright/test';

const regionResponse = {
    success: true,
    data: [
        { name: '경기도', count: 1, areas: [{ name: '안산시', count: 1 }] },
        { name: '서울특별시', count: 1, areas: [{ name: '종로구', count: 1 }] },
    ],
};

async function mockAnonymousSession(page) {
    await page.route('**/api/member/me', route => route.fulfill({
        status: 401,
        json: { success: false, message: '인증이 필요합니다.' },
    }));
    await page.route('**/api/auth/refresh', route => route.fulfill({
        status: 401,
        json: { success: false, message: '세션이 없습니다.' },
    }));
    await page.route(/\/api\/stores(?:\?.*)?$/, route => route.fulfill({
        json: {
            success: true,
            data: {
                content: [],
                page: { size: 12, number: 0, totalElements: 0, totalPages: 0 },
            },
        },
    }));
}

test.beforeEach(async ({ page }) => {
    await mockAnonymousSession(page);
});

async function recordRegionMotion(page) {
    await page.evaluate(() => {
        window.__regionMotion = [];
        const capture = element => {
            if (!(element instanceof Element)) return;
            const modals = element.matches('.reserve-region-sheet-root .ant-modal')
                ? [element] : element.querySelectorAll('.reserve-region-sheet-root .ant-modal');
            for (const modal of modals) {
                const style = getComputedStyle(modal);
                const container = modal.querySelector('.ant-modal-container');
                const containerStyle = container ? getComputedStyle(container) : null;
                window.__regionMotion.push({ className: modal.className, name: style.animationName, duration: style.animationDuration,
                    containerName: containerStyle?.animationName, containerDuration: containerStyle?.animationDuration });
            }
        };
        new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') capture(mutation.target);
                else for (const node of mutation.addedNodes) capture(node);
            }
        }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
}

test('region selector uses viewport-appropriate reversible motion above the messenger launcher', async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route('**/api/stores/regions', route => route.fulfill({ json: regionResponse }));
    await page.goto('/');
    await recordRegionMotion(page);

    await page.getByRole('button', { name: /전체 지역/ }).first().click();
    const modal = page.locator('.reserve-region-sheet-root .ant-modal');
    await expect(modal).toBeVisible();
    await expect.poll(async () => {
        const entries = await page.evaluate(() => window.__regionMotion);
        const name = isMobile ? 'reserve-region-sheet-enter' : 'reserve-region-dialog-enter';
        return entries.some(entry => entry.className.includes('reserve-region-sheet-motion-') && (isMobile ? entry.containerName : entry.name)?.includes(name));
    }).toBe(true);
    await expect.poll(() => modal.evaluate(element => getComputedStyle(element).animationName)).toBe('none');

    const geometry = await page.evaluate(() => {
        const sheet = document.querySelector('.reserve-region-sheet-root .ant-modal');
        const wrap = document.querySelector('.reserve-region-sheet-root .ant-modal-wrap');
        const launcher = document.querySelector('.reserve-messenger-launcher-wrap');
        return {
            top: sheet.getBoundingClientRect().top,
            bottom: sheet.getBoundingClientRect().bottom,
            viewportBottom: window.innerHeight,
            regionZ: Number(getComputedStyle(wrap).zIndex),
            launcherZ: launcher ? Number(getComputedStyle(launcher).zIndex) : null,
        };
    });
    if (isMobile) expect(Math.abs(geometry.bottom - geometry.viewportBottom)).toBeLessThanOrEqual(2);
    else {
        expect(geometry.top).toBeGreaterThan(24);
        expect(geometry.bottom).toBeLessThan(geometry.viewportBottom);
    }
    expect(geometry.regionZ).toBe(1100);
    if (geometry.launcherZ !== null) expect(geometry.regionZ).toBeGreaterThan(geometry.launcherZ);

    const close = page.locator('.reserve-region-sheet-root .ant-modal-close');
    await page.keyboard.press('Tab');
    await close.focus();
    const focus = await close.evaluate(element => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--c-text-secondary)';
        document.body.append(probe);
        const neutralColor = getComputedStyle(probe).color;
        probe.remove();
        return { visible: element.matches(':focus-visible'), outlineColor: getComputedStyle(element).outlineColor, neutralColor };
    });
    expect(focus.visible).toBe(true);
    expect(focus.outlineColor).toBe(focus.neutralColor);

    await page.locator('.reserve-region-sheet-groups').getByRole('button', { name: /서울특별시/ }).click();
    await close.click();
    await expect.poll(async () => {
        const entries = await page.evaluate(() => window.__regionMotion);
        const name = isMobile ? 'reserve-region-sheet-leave' : 'reserve-region-dialog-leave';
        return entries.some(entry => entry.className.includes('reserve-region-sheet-motion-leave') && (isMobile ? entry.containerName : entry.name)?.includes(name));
    }).toBe(true);
    await expect(modal).not.toBeVisible();

    await page.getByRole('button', { name: /전체 지역/ }).first().click();
    await expect(page.locator('.reserve-region-sheet-actions').getByRole('button', { name: '전국 적용' })).toBeVisible();
});

test('region loading skeleton uses six desktop slots and four phone slots', async ({ page, isMobile }) => {
    await page.route('**/api/stores/regions', async route => {
        await new Promise(resolve => setTimeout(resolve, 900));
        await route.fulfill({ json: regionResponse });
    });
    await page.goto('/');

    await page.getByRole('button', { name: /전체 지역/ }).first().click();
    const placeholders = page.locator('.reserve-region-sheet-popular-placeholder');
    await expect(placeholders.first()).toBeVisible();
    expect(await placeholders.evaluateAll(items => items.filter(item => getComputedStyle(item).display !== 'none').length))
        .toBe(isMobile ? 4 : 6);
});

test('list region hover surface stays smaller than its touch target and reduced motion is instant', async ({ page, isMobile }) => {
    await page.route('**/api/stores/regions', route => route.fulfill({ json: regionResponse }));
    await page.goto('/stores');
    const trigger = page.locator('.reserve-explore-region-trigger');
    await expect(trigger).toBeEnabled();
    const hitHeight = await trigger.evaluate(element => element.getBoundingClientRect().height);
    expect(hitHeight).toBeGreaterThanOrEqual(44);
    if (!isMobile) {
        await trigger.hover();
        const hover = await trigger.evaluate(element => ({
            insetTop: getComputedStyle(element, '::before').top,
            insetBottom: getComputedStyle(element, '::before').bottom,
        }));
        expect(hover.insetTop).toBe('6px');
        expect(hover.insetBottom).toBe('6px');
        await expect.poll(() => trigger.evaluate(element => getComputedStyle(element, '::before').opacity)).toBe('1');
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordRegionMotion(page);
    await trigger.click();
    await expect(page.locator('.reserve-region-sheet-root .ant-modal')).toBeVisible();
    const sheet = page.locator('.reserve-region-sheet-root .ant-modal');
    await expect(sheet).toHaveCSS('animation-name', 'none');
    await sheet.locator('.ant-modal-close').click();
    await expect(sheet).toBeHidden();
    await trigger.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
});

test('mobile region sheet entrance follows one upward path without a snap back', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile bottom sheet only');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route('**/api/stores/regions', async route => {
        await new Promise(resolve => setTimeout(resolve, 650));
        await route.fulfill({ json: regionResponse });
    });
    await page.goto('/');
    await expect(page.locator('.reserve-discovery-location-link')).toBeVisible();
    const samples = await page.evaluate(async () => {
        document.querySelector('.reserve-discovery-location-link')?.click();
        const frames = [];
        const started = performance.now();
        while (performance.now() - started < 550) {
            await new Promise(requestAnimationFrame);
            const modal = document.querySelector('.reserve-region-sheet-root .ant-modal');
            if (modal) {
                const rect = modal.getBoundingClientRect();
                const wrap = document.querySelector('.reserve-region-sheet-root .ant-modal-wrap');
                const container = modal.querySelector('.ant-modal-container');
                frames.push({ top: Math.round(rect.top), bottom: Math.round(rect.bottom), wrapScrollTop: wrap.scrollTop,
                    slideTop: container ? Math.round(container.getBoundingClientRect().top) : null,
                    slideName: container ? getComputedStyle(container).animationName : null });
            }
        }
        return frames;
    });
    expect(samples.length).toBeGreaterThan(5);
    const settled = samples.at(-1);
    expect(samples.every(sample => sample.wrapScrollTop === 0)).toBe(true);
    expect(samples.every(sample => Math.abs(sample.top - settled.top) <= 2 && Math.abs(sample.bottom - settled.bottom) <= 2)).toBe(true);
    expect(samples.some(sample => sample.slideName === 'reserve-region-sheet-enter')).toBe(true);
    const slideTops = samples.map(sample => sample.slideTop).filter(top => top !== null);
    expect(Math.max(...slideTops)).toBeGreaterThan(settled.slideTop + 100);
    expect(Math.min(...slideTops)).toBeGreaterThanOrEqual(settled.slideTop - 2);
    expect(slideTops.every((top, index) => index === 0 || top <= slideTops[index - 1] + 2)).toBe(true);

    const leaveSamples = await page.evaluate(async () => {
        document.querySelector('.reserve-region-sheet-root .ant-modal-close')?.click();
        const frames = [];
        const started = performance.now();
        while (performance.now() - started < 400) {
            await new Promise(requestAnimationFrame);
            const modal = document.querySelector('.reserve-region-sheet-root .ant-modal');
            const wrap = document.querySelector('.reserve-region-sheet-root .ant-modal-wrap');
            const container = modal?.querySelector('.ant-modal-container');
            if (modal && container && wrap) frames.push({
                top: Math.round(modal.getBoundingClientRect().top), wrapScrollTop: wrap.scrollTop,
                slideTop: Math.round(container.getBoundingClientRect().top),
                slideName: getComputedStyle(container).animationName,
            });
        }
        return frames;
    });
    expect(leaveSamples.some(sample => sample.slideName === 'reserve-region-sheet-leave')).toBe(true);
    expect(leaveSamples.every(sample => sample.wrapScrollTop === 0 && Math.abs(sample.top - settled.top) <= 2)).toBe(true);
    const leaveSlideTops = leaveSamples.map(sample => sample.slideTop);
    expect(Math.max(...leaveSlideTops)).toBeGreaterThan(Math.min(...leaveSlideTops) + 100);
    expect(leaveSlideTops.every((top, index) => index === 0 || top >= leaveSlideTops[index - 1] - 2)).toBe(true);
});
