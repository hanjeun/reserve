import { describe, expect, it } from 'vitest';
import { businessTabSearch } from './businessTabQuery';

describe('businessTabSearch', () => {
    it('keeps no-show filters separate from reservation and settlement filters', () => {
        const opened = new URLSearchParams(businessTabSearch('?tab=reservations&reservationPage=4&settlementPage=2',
            'no-show', 'noShowStore=7&noShowStatus=NO_SHOW&noShowPage=3'));
        expect(opened.get('tab')).toBe('no-show');
        expect(opened.get('noShowStatus')).toBe('NO_SHOW');
        expect(opened.get('noShowPage')).toBe('3');
        expect(opened.has('reservationPage')).toBe(false);
        expect(opened.has('settlementPage')).toBe(false);
        const closed = new URLSearchParams(businessTabSearch(opened, 'settlements'));
        expect(closed.has('noShowStatus')).toBe(false);
        expect(closed.has('noShowStore')).toBe(false);
    });
    it('keeps the originating work filters through QR open, reload and close', () => {
        const original = '?tab=waiting&waitingStore=5&waitingSearch=손님&waitingStatus=SEATED&view=cards&utm_source=review';
        const open = new URLSearchParams(businessTabSearch(original, 'qr-checkin'));
        expect(open.get('tab')).toBe('qr-checkin');
        expect(open.get('qrReturn')).toBe('waiting');
        expect(open.get('waitingStore')).toBe('5');
        expect(businessTabSearch(open, 'qr-checkin')).toBe(open.toString());
        const closed = new URLSearchParams(businessTabSearch(open, 'waiting'));
        expect(closed.get('tab')).toBe('waiting');
        expect(closed.has('waitingSearch')).toBe(false);
        expect(closed.get('view')).toBe('cards');
        expect(closed.has('qrReturn')).toBe(false);
        expect(closed.get('utm_source')).toBe('review');
    });
    it('normalizes direct QR and invalid return menus to reservations', () => {
        const params = new URLSearchParams(businessTabSearch('?tab=qr-checkin&qrReturn=unknown', 'qr-checkin'));
        expect(params.get('qrReturn')).toBe('reservations');
        expect(new URLSearchParams(businessTabSearch(params, 'unknown')).get('tab')).toBe('reservations');
    });
    it('removes reservation and statistics state when the advertisement tab opens', () => {
        const result = new URLSearchParams(businessTabSearch(
            '?view=list&tab=ads&statisticsRange=90d&advertisementSearch=카페',
            'ads',
        ));

        expect(result.get('tab')).toBe('ads');
        expect(result.get('advertisementSearch')).toBe('카페');
        expect(result.has('view')).toBe(false);
        expect(result.has('statisticsRange')).toBe(false);
    });

    it('keeps unrelated attribution values while changing business tabs', () => {
        const result = new URLSearchParams(businessTabSearch(
            '?tab=analytics&statisticsRange=90d&utm_source=portfolio',
            'reservations',
        ));

        expect(result.get('tab')).toBe('reservations');
        expect(result.get('utm_source')).toBe('portfolio');
        expect(result.has('statisticsRange')).toBe(false);
    });

    it('keeps the news view with its filters and restores it separately from waiting', () => {
        const news = 'tab=news&newsStore=7&newsState=PUBLISHED&newsPage=2&view=cards';
        expect(businessTabSearch(news, 'news')).toBe(news);
        expect(businessTabSearch(news, 'waiting')).toBe('tab=waiting');
        expect(businessTabSearch('?tab=waiting&view=list', 'news', news)).toBe(news);
    });

    it('keeps waiting selection and view only in tabs that use them', () => {
        const waiting = new URLSearchParams(businessTabSearch('?waitingStore=5&waitingSearch=손님&waitingStatus=SEATED&view=cards&reservationPage=2', 'waiting'));
        expect(waiting.get('tab')).toBe('waiting');
        expect(waiting.get('waitingStore')).toBe('5');
        expect(waiting.has('waitingSearch')).toBe(false);
        expect(waiting.get('waitingStatus')).toBe('SEATED');
        expect(waiting.get('view')).toBe('cards');
        expect(waiting.has('reservationPage')).toBe(false);
        const analytics = new URLSearchParams(businessTabSearch(waiting, 'analytics'));
        expect(analytics.has('waitingStore')).toBe(false);
        expect(analytics.has('waitingSearch')).toBe(false);
        expect(analytics.has('waitingStatus')).toBe(false);
        expect(analytics.has('view')).toBe(false);
    });
    it('restores the destination view, store and page without carrying the source view or search', () => {
        const params = new URLSearchParams(businessTabSearch('?tab=waiting&waitingStore=5&waitingSearch=손님&view=cards&utm_source=guide',
            'reservations', 'view=list&reservationStore=ALL&reservationStatus=OPEN&reservationPage=3&waitingStore=9'));
        expect(Object.fromEntries(params)).toEqual({ tab: 'reservations', utm_source: 'guide', view: 'list', reservationStore: 'all', reservationStatus: 'OPEN', reservationPage: '3' });
    });
});
