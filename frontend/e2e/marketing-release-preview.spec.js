import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const origin = 'http://127.0.0.1:4174';
const output = path.resolve('test-results/release-preview-20261023/marketing');

test.use({ channel: 'chrome', reducedMotion: 'no-preference', colorScheme: 'light' });
test.skip(process.env.RESERVE_RELEASE_PREVIEW !== '1', 'Explicit local release preview only');

test('marketing release preview: sections, photos, footer and scroll motion', async ({ page }, info) => {
    test.setTimeout(120_000);
    const mobile = info.project.name.includes('mobile');
    const label = mobile ? 'mobile' : 'pc';
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin
        ? route.continue() : route.abort('blockedbyclient'));
    await mkdir(output, { recursive: true });
    const capture = async (name, locator) => {
        const destination = path.join(output, `${label}-${name}.png`);
        if (locator) await locator.screenshot({ path: destination });
        else await page.screenshot({ path: destination });
        if (process.env.RESERVE_UI_PREVIEW_MANUAL === '1') await page.pause();
    };
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    const layout = page.locator(mobile ? '.marketing-mobile' : '.marketing-desktop');
    await expect(layout).toBeVisible();
    const accountLinks = page.getByRole('navigation', { name: '계정' });
    await expect(accountLinks.getByRole('link', { name: '로그인' })).toHaveAttribute('href', /\/login$/);
    await expect(accountLinks.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', /\/signup$/);
    const heroActions = layout.locator('.marketing-hero-actions');
    await expect(heroActions.getByRole('link')).toHaveCount(1);
    await expect(heroActions.getByRole('link', { name: '가게 둘러보기' })).toHaveAttribute('href', /\/stores$/);
    await expect.poll(() => page.locator('.slide-up:visible').first().evaluate(node => getComputedStyle(node).opacity)).toBe('1');
    await capture('01-hero');

    // Observe real wheel scrolling without replacing the app's animation or scroll owner.
    const trace = page.evaluate(() => new Promise(resolve => {
        const samples = [];
        const began = performance.now();
        const observe = () => {
            samples.push(scrollY);
            if (performance.now() - began < 850) requestAnimationFrame(observe);
            else resolve(samples);
        };
        requestAnimationFrame(observe);
    }));
    await page.mouse.move(mobile ? 190 : 720, 480);
    await page.mouse.wheel(0, 120);
    const samples = await trace;
    const finalScroll = await page.evaluate(() => scrollY);
    expect(finalScroll).toBeGreaterThan(50);
    expect(samples.some(value => value > 1 && value < finalScroll - 1)).toBe(true);

    for (let index = 0; index < 3; index++) {
        const scene = layout.locator(`[id="${mobile ? 'mobile-' : ''}section-${index}"]`);
        const heading = scene.locator('[data-marketing-section-title]');
        await heading.scrollIntoViewIfNeeded();
        const fullText = (await heading.getAttribute('aria-label')).replace(/\s/g, '');
        await expect.poll(async () => (await heading.locator('.marketing-typing-text').allTextContents()).join('').replace(/\s/g, ''),
            { timeout: 12_000 }).toBe(fullText);
        if (index === 0) {
            const images = scene.locator('img');
            await expect(images).toHaveCount(2);
            await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => node.complete && node.naturalWidth > 0))).toBe(true);
        }
        await capture(`0${index + 2}-feature-${index}`, scene);
    }

    const faq = layout.locator(`[id="${mobile ? 'mobile-' : ''}section-faq"]`);
    await faq.scrollIntoViewIfNeeded();
    await expect(faq.getByRole('heading', { name: '자주 묻는 질문' })).toBeVisible();
    await expect(faq.locator('[data-marketing-section-title], [data-marketing-typing]')).toHaveCount(0);
    await capture('05-faq', faq);

    const footer = page.locator('.reserve-app-footer');
    await footer.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    await expect(footer).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await capture('06-footer');
    const link = footer.getByRole('link', { name: '사용자 이용안내', exact: true });
    const before = await link.evaluate(node => ({ color: getComputedStyle(node).color, underline: getComputedStyle(node).textDecorationLine }));
    expect(before.underline).not.toContain('underline');
    await link.hover();
    await expect.poll(() => link.evaluate(node => getComputedStyle(node).textDecorationLine)).toContain('underline');
    await expect.poll(() => link.evaluate(node => getComputedStyle(node).color)).not.toBe(before.color);
    await capture('07-footer-hover');

    const startingScroll = await page.evaluate(() => scrollY);
    const returning = page.evaluate(() => new Promise(resolve => {
        const samples = [];
        const began = performance.now();
        const observe = () => {
            samples.push(scrollY);
            if (performance.now() - began < 850) requestAnimationFrame(observe);
            else resolve(samples);
        };
        requestAnimationFrame(observe);
    }));
    await footer.locator('[data-scroll-top]').click();
    const returnSamples = await returning;
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
    expect(returnSamples.some(value => value > 1 && value < startingScroll - 1)).toBe(true);
    await capture('08-logo-return');
});
