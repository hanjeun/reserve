import { describe, expect, it } from 'vitest';
import { koreanSearchDate, searchCorrections, understandSearch } from '../searchUnderstanding';
const now = new Date('2026-10-25T15:01:00Z');

describe('로컬 검색 해석', () => {
    it('오타는 원문을 바꾸지 않고 제한된 교정 후보로만 돌려준다', () => {
        expect(searchCorrections('강남 스터디오')).toEqual([{ keyword: '강남 스튜디오', kind: 'correction' }]);
        expect(searchCorrections('스튜디요')).toEqual([{ keyword: '스튜디오', kind: 'correction' }]);
        for (const value of ['가게', 'reser', '홍보', '스튜디오', '내가 어제 예약했던 공방']) expect(searchCorrections(value)).toEqual([]);
    });
    it('서버나 PC 시간대와 무관하게 한국 날짜 경계를 적용한다', () => {
        expect(koreanSearchDate(new Date('2026-10-25T14:59:59Z'))).toBe('2026-10-25');
        expect(koreanSearchDate(now)).toBe('2026-10-26');
        expect(koreanSearchDate(new Date('2026-12-31T15:00:00Z'), 1)).toBe('2027-01-02');
    });
    it('모호한 내일 예약은 선택 전 조회하지 않고 대상에 맞는 날짜만 유지한다', () => {
        expect(understandSearch('내일 예약', { now }).choices).toHaveLength(2);
        expect(understandSearch('내일 예약', { now, choice: 'reservations' })).toMatchObject({ scope: 'reservations', date: '2026-10-27', term: '', choices: [] });
        expect(understandSearch('내일 예약', { now, choice: 'stores' })).toMatchObject({ scope: 'stores', date: '', term: '', choices: [] });
        expect(understandSearch('내일 예약', { now, choice: '/admin' }).choices).toHaveLength(2);
    });
    it.each([['내가 예약한', 'reservations', '', ''], ['내 예약 내일 공방', 'reservations', '공방', '2026-10-27'],
        ['내 메시지 어제', 'messages', '', '2026-10-25'], ['내 웨이팅 오늘 카페', 'waiting', '카페', '2026-10-26']])('개인 대상을 추출한다: %s', (text, scope, term, date) => {
        expect(understandSearch(text, { now })).toMatchObject({ scope, term, date });
    });
    it.each(['강남 공방', '강남구 공방', '서울 강남 공방', '서울특별시 강남구 공방'])('지역과 검색어를 분리한다: %s', text => {
        expect(understandSearch(text)).toMatchObject({ scope: 'stores', region: '서울 강남구', term: '공방' });
    });
    it('중구처럼 여러 지역에 있는 이름은 선택을 요구한다', () => {
        expect(understandSearch('중구 공방').choices).toHaveLength(6);
        expect(understandSearch('중구 공방', { choice: '부산 중구' })).toMatchObject({ scope: 'stores', region: '부산 중구', term: '공방', choices: [] });
    });
    it('사전에 없는 표현을 임의로 날짜나 권한 명령으로 바꾸지 않는다', () => {
        expect(understandSearch('내일같은 가게')).toMatchObject({ scope: 'all', term: '내일같은 가게', region: '', date: '' });
    });
    it('대상과 지역이 모두 모호해도 앞선 선택을 유지하며 순서대로 해석한다', () => {
        expect(understandSearch('내일 예약 중구 공방', { now }).choices.map(item => item.id)).toEqual(['reservations', 'stores']);
        expect(understandSearch('내일 예약 중구 공방', { now, choice: 'stores' }).choices).toHaveLength(6);
        expect(understandSearch('내일 예약 중구 공방', { now, choice: 'stores|부산 중구' })).toMatchObject({ scope: 'stores', term: '공방', region: '부산 중구', date: '', choices: [] });
    });
});
