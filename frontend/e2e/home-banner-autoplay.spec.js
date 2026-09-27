import { expect, test } from '@playwright/test';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });

test('the visible home banner advances on its own while the shared header and tabs stay put', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    const featured = page.getByRole('region', { name: '서비스 추천' });
    await featured.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
    const cover = featured.locator('.reserve-discovery-banner--current img');
    await expect.poll(async () => cover.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    const next = page.getByRole('button', { name: '다음 추천 배너 보기' });
    await expect(next).toContainText('1 / 4');
    const header = await page.locator('.reserve-header-inner').boundingBox();
    const tabs = await page.locator('.reserve-discovery-top-nav').boundingBox();

    await expect(next).toContainText('2 / 4', { timeout: 12000 });
    await expect(featured.locator('.reserve-discovery-banner--current')).toHaveCount(1);
    expect(await page.locator('.reserve-header-inner').boundingBox()).toEqual(header);
    expect(await page.locator('.reserve-discovery-top-nav').boundingBox()).toEqual(tabs);
});
