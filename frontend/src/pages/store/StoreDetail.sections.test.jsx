import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreDetailMobileLayout, StoreDetailPCLayout } from './StoreDetail';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => motion.reduced }));
vi.mock('../../components/common/PhotoGallery', () => ({ default: () => <div>가게 사진</div> }));
vi.mock('../../components/common', async importOriginal => ({ ...await importOriginal(),
    FavoriteButton: () => null, KakaoMap: () => <div>가게 지도</div>,
}));
vi.mock('../../components/review', () => ({ ReviewList: () => <div>방문 후기 목록</div> }));
vi.mock('../../components/waiting/WaitingJoin', () => ({ default: () => <div>웨이팅 신청</div> }));
vi.mock('../../components/waiting/WaitingStoreSummary', () => ({ default: () => null }));
vi.mock('../../components/reservation/StoreReservationPanel', () => ({
    ReservationPanel: () => <div><label>예약 날짜<input type="date" /></label><label>인원 수<input defaultValue="1" /></label></div>,
    TimeSlotPicker: () => null,
}));

const store = { id: 42, name: '합성 가게', address: '서울 합성로 42', openTime: '09:00', closeTime: '18:00' };
const propsFor = (data = store) => ({ sliderImages: [], identityProps: { store: data }, panelProps: { store: data }, reviewProps: {} });

afterEach(() => vi.restoreAllMocks());

describe('가게 상세의 모바일 섹션 이동', () => {
    it.each([['smooth', false], ['instant', true]])('섹션을 %s 방식으로 찾아가고 예약 입력을 유지해요', async (behavior, reduced) => {
        motion.reduced = reduced;
        render(<StoreDetailMobileLayout {...propsFor()} />);
        const nav = screen.getByRole('navigation', { name: '가게 상세 섹션' });
        const links = within(nav).getAllByRole('link');
        expect(links.map(link => link.textContent)).toEqual(['소개', '위치', '예약', '리뷰']);
        const offsets = [0, 450, 750, 1100];
        let scroll = 0;
        vi.spyOn(window.performance, 'now').mockReturnValue(100);
        vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ bottom: 108 });
        const targets = links.map((link, index) => {
            const target = document.getElementById(link.hash.slice(1));
            vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => ({ top: 108 + offsets[index] - scroll }));
            target.scrollIntoView = vi.fn();
            return target;
        });
        const scrollAt = async offset => {
            scroll = offset;
            await act(async () => {
                fireEvent.scroll(window);
                await new Promise(resolve => window.requestAnimationFrame(resolve));
            });
        };
        expect(within(targets[0]).getByRole('link', { name: store.address })).toBeInTheDocument();
        expect(within(targets[1]).queryByRole('heading')).toBeNull();
        expect(within(targets[1]).getByText('가게 지도')).toBeInTheDocument();
        expect(within(targets[0]).getByText('영업 시간')).toBeInTheDocument();
        expect(links[0]).toHaveAttribute('aria-current', 'location');

        const date = screen.getByLabelText('예약 날짜');
        const guests = screen.getByLabelText('인원 수');
        fireEvent.change(date, { target: { value: '2026-12-03' } });
        fireEvent.change(guests, { target: { value: '3' } });
        expect(fireEvent.click(links[3])).toBe(false);
        expect(targets[3]).toHaveFocus();
        expect(targets[3].scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior, block: 'start' });
        expect(links[3]).toHaveAttribute('aria-current', 'location');
        if (!reduced) {
            await scrollAt(450);
            expect(links[3]).toHaveAttribute('aria-current', 'location');
            await scrollAt(750);
            expect(links[3]).toHaveAttribute('aria-current', 'location');
        }
        await scrollAt(1140);
        fireEvent(document, new Event('scrollend'));
        await scrollAt(450);
        expect(links[1]).toHaveAttribute('aria-current', 'location');

        fireEvent.click(links[0]);
        fireEvent.wheel(window, { deltaY: 120 });
        await scrollAt(750);
        expect(links[2]).toHaveAttribute('aria-current', 'location');
        expect(screen.getByLabelText('예약 날짜')).toBe(date);
        expect(date).toHaveValue('2026-12-03');
        expect(guests).toHaveValue('3');
    });

    it.each([['REMOTE', ['소개', '웨이팅', '리뷰']], ['OFF', ['소개', '리뷰']]])('제공하는 %s 섹션만 탐색할 수 있어요', (mode, labels) => {
        render(<StoreDetailMobileLayout {...propsFor({ ...store, address: null, reservationEnabled: false, waitingIntakeMode: mode })} />);
        const nav = screen.getByRole('navigation', { name: '가게 상세 섹션' });
        expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(labels);
    });

    it('PC 상세에서는 기존 주소와 예약 폼을 제공해요', () => {
        render(<StoreDetailPCLayout {...propsFor()} />);
        expect(screen.queryByRole('navigation', { name: '가게 상세 섹션' })).toBeNull();
        expect(screen.getByRole('link', { name: store.address })).toBeInTheDocument();
        expect(screen.getByLabelText('예약 날짜')).toBeInTheDocument();
    });
});
