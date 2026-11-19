import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import SeasonalPreview from './SeasonalPreview';
import { getSeasonEffect } from './seasonEffect';
import useSeasonEffectPreference from './useSeasonEffectPreference';

describe('계절 효과', () => {
    it.each([
        ['2026-03-19T14:59:59Z', null],
        ['2026-03-19T15:00:00Z', 'spring'],
        ['2026-04-30T14:59:59Z', 'spring'],
        ['2026-04-30T15:00:00Z', null],
        ['2026-07-14T14:59:59Z', null],
        ['2026-07-14T15:00:00Z', 'summer'],
        ['2026-08-15T14:59:59Z', 'summer'],
        ['2026-08-15T15:00:00Z', null],
        ['2026-10-14T14:59:59Z', null],
        ['2026-10-14T15:00:00Z', 'autumn'],
        ['2026-11-25T14:59:59Z', 'autumn'],
        ['2026-11-25T15:00:00Z', null],
        ['2026-12-14T14:59:59Z', null],
        ['2026-12-14T15:00:00Z', 'snowfall'],
        ['2026-12-31T15:00:00Z', 'snowfall'],
        ['2027-01-25T14:59:59Z', 'snowfall'],
        ['2027-01-25T15:00:00Z', null],
    ])('한국 시간으로 %s의 계절을 선택한다', (date, season) => {
        expect(getSeasonEffect(null, new Date(date))).toBe(season);
    });

    it('미리보기는 로컬 주소에서 인식하는 효과만 적용한다', () => {
        const date = new Date('2026-09-10T00:00:00Z');
        const location = { hostname: 'localhost', search: '?season-preview=snowfall' };
        expect(getSeasonEffect(location, date)).toBe('snowfall');
        expect(getSeasonEffect({ ...location, search: '?season-preview=summer' }, date)).toBe('summer');
        expect(getSeasonEffect({ ...location, search: '?season-preview=invalid' }, date)).toBeNull();
        expect(getSeasonEffect({ ...location, hostname: 'app.reserve.it.kr' }, date)).toBeNull();
    });

    it('이전 앱 설정을 이어받고 소개 효과는 계절에 맞춰 표시한다', () => {
        const path = window.location.href;
        const storageKey = 'reserve-winter-effect-off';
        localStorage.setItem(storageKey, '1');
        try {
            window.history.replaceState(null, '', '/?season-preview=autumn');
            const preference = renderHook(useSeasonEffectPreference);
            expect(preference.result.current[0]).toBe(false);
            const preview = render(createElement(SeasonalPreview));
            expect(preview.container.querySelector('[data-season-preview="autumn"] .reserve-season-preview-paint')).toBeInTheDocument();
            expect(preview.queryByRole('button')).toBeNull();

            act(() => preference.result.current[1](true));
            expect(preference.result.current[0]).toBe(true);
            expect(localStorage.getItem(storageKey)).toBe('0');
        } finally {
            localStorage.removeItem(storageKey);
            window.history.replaceState(null, '', path);
        }
    });
});
