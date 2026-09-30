import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StoreFormSkeleton from './StoreFormSkeleton';
import { STORE_FORM_SKELETON_HINTS, STORE_FORM_SKELETON_TOGGLES } from './storeFormSkeletonCopy';
import basicInfoSource from './StoreForm/StoreBasicInfo.jsx?raw';
import imagesSource from './StoreForm/StoreImages.jsx?raw';
import actionsSource from './StoreForm/StoreFormActions.jsx?raw';
import { BOOKING_TYPE_HINTS } from '../../constants';

const originalWidth = window.innerWidth;
const setWidth = width => Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

describe('StoreFormSkeleton', () => {
    afterEach(() => setWidth(originalWidth));

    it('reserves the full form structure instead of ending after a few inputs', () => {
        const { container } = render(<StoreFormSkeleton />);

        expect(container.querySelector('[data-skeleton-section="basic"]')).not.toBeNull();
        expect(container.querySelector('[data-skeleton-section="settings"]')).not.toBeNull();
        expect(container.querySelector('[data-skeleton-section="images"]')).not.toBeNull();
        expect(container.querySelector('[data-skeleton-section="actions"]')).not.toBeNull();
        expect(container.querySelectorAll('.reserve-store-form-skeleton-toggle')).toHaveLength(4);
    });

    it('mirrors every visible field of the SLOT form in the same order, labels as real text', () => {
        const { container } = render(<StoreFormSkeleton />);
        const labels = Array.from(container.querySelectorAll('.reserve-store-form-skeleton-field'), field => field.dataset.label);
        expect(labels).toEqual([
            '가게 이름', '예약 방식', '서비스 분야', '카테고리', '예약 단위', '연락처', '영업 시간', '브레이크 타임', '주소', '가게 소개',
            '최대 예약 인원', '노쇼 예약금', '우리동네 배지 기준', '정기 휴무', '운영 기간', '임시 휴무일', '예약 가능 기간',
            '전액 환불', '부분 환불', '부분 환불율', '예약 마감', '결제 마감', '대표 이미지', '상세 이미지 (최대 5장)',
        ]);
        expect(container.querySelector('input,button,select,textarea,a')).toBeNull();
    });

    it('uses the real form frame: two columns from 900px, one column and small inputs below', () => {
        setWidth(1280);
        const { container, unmount } = render(<StoreFormSkeleton />);
        expect(container.querySelector('.reserve-store-form-skeleton-grid')).not.toBeNull();
        expect(container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth: '1000px', padding: '48px 24px 80px' });
        unmount();

        setWidth(820);
        const tablet = render(<StoreFormSkeleton />);
        expect(tablet.container.querySelector('.reserve-store-form-skeleton-grid')).toBeNull();
        expect(tablet.container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth: '700px' });
        tablet.unmount();

        setWidth(390);
        const mobile = render(<StoreFormSkeleton mode="edit" />);
        expect(mobile.container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth: '420px', padding: '20px 16px 40px' });
        expect(mobile.container.querySelector('h2')).toHaveTextContent('가게 정보 수정');
    });

    it('keeps its fixed hint copy identical to the real form components', () => {
        const sources = basicInfoSource + imagesSource + actionsSource;
        const { bookingType, detailImages, ...plain } = STORE_FORM_SKELETON_HINTS;
        expect(bookingType).toBe(BOOKING_TYPE_HINTS.SLOT);
        expect(imagesSource).toContain(detailImages.trim());
        Object.values(plain).forEach(text => expect(sources).toContain(text));
        STORE_FORM_SKELETON_TOGGLES.forEach(([name, label, desc]) => {
            expect(basicInfoSource).toContain(`name="${name}"`);
            expect(basicInfoSource).toContain(`label="${label}"`);
            expect(basicInfoSource).toContain(`desc="${desc}"`);
        });
    });
});
