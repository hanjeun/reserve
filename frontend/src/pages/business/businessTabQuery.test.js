import { describe, expect, it } from 'vitest';
import { businessTabSearch } from './businessTabQuery';

describe('businessTabSearch', () => {
    it('keeps the originating work filters through QR open, reload and close', () => {
        const original = '?tab=waiting&waitingStore=5&waitingSearch=손님&waitingStatus=SEATED&view=cards&utm_source=review';
        const open = new URLSearchParams(businessTabSearch(original, 'qr-checkin'));
        expect(open.get('tab')).toBe('qr-checkin');
        expect(open.get('qrReturn')).toBe('waiting');
        expect(open.get('waitingStore')).toBe('5');
        expect(businessTabSearch(open, 'qr-checkin')).toBe(open.toString());
        const closed = new URLSearchParams(businessTabSearch(open, 'waiting'));
        expect(closed.get('tab')).toBe('waiting');
        expect(closed.get('waitingSearch')).toBe('손님');
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

    it('keeps waiting selection and view only in tabs that use them', () => {
        const waiting = new URLSearchParams(businessTabSearch('?waitingStore=5&waitingSearch=손님&waitingStatus=SEATED&view=cards&reservationPage=2', 'waiting'));
        expect(waiting.get('tab')).toBe('waiting');
        expect(waiting.get('waitingStore')).toBe('5');
        expect(waiting.get('waitingSearch')).toBe('손님');
        expect(waiting.get('waitingStatus')).toBe('SEATED');
        expect(waiting.get('view')).toBe('cards');
        expect(waiting.has('reservationPage')).toBe(false);
        const analytics = new URLSearchParams(businessTabSearch(waiting, 'analytics'));
        expect(analytics.has('waitingStore')).toBe(false);
        expect(analytics.has('waitingSearch')).toBe(false);
        expect(analytics.has('waitingStatus')).toBe(false);
        expect(analytics.has('view')).toBe(false);
    });
});
