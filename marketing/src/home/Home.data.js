import { colors } from '../../../frontend/src/styles/tokens/index.js';

export const STORE_DATA = [
    {
        name: '모던 필라테스 스튜디오',
        category: '필라테스',
        rating: 4.9,
        reviewCount: 128,
        img: '/images/pilates.jpg',
    },
    {
        name: '청담 헤어살롱 료',
        category: '헤어',
        rating: 4.8,
        reviewCount: 94,
        img: '/images/hair.jpg',
    },
];

export const RESERVATION_DATA = [
    {
        storeName: '모던 필라테스 스튜디오',
        img: '/images/pilates.jpg',
        date: '2026-03-15', time: '19:00', guestCount: 2, amount: 50000,
        statusLabel: '예약 확정', statusColor: colors.primary.main,
        actionLabel: '취소', actionVariant: 'ghost-sm-danger',
    },
    {
        storeName: '청담 헤어살롱 료',
        img: '/images/hair.jpg',
        date: '2026-03-22', time: '20:00', guestCount: 4, amount: 80000,
        statusLabel: '이용 완료', statusColor: colors.success.main,
        actionLabel: '리뷰 쓰기', actionVariant: 'ghost-sm-primary',
    },
];

export const FAQS = [
    { q: '예약은 어떻게 하나요?',              a: '원하는 가게에서 날짜·시간·인원을 선택하고 예약 조건과 동의를 확인해 신청해요. 예약 방식은 가게마다 달라요.' },
    { q: '예약 취소는 가능한가요?',             a: '내 예약에서 취소 가능 여부를 확인해요. 취소 시점과 가게의 안내 조건에 따라 환불 금액이 달라질 수 있어요.' },
    { q: '결제는 어떻게 이루어지나요?',         a: '예약금이 있는 가게는 결제 화면에서 제공되는 수단으로 결제해요. 결제 전에 금액과 취소·환불 조건을 확인해주세요.' },
    { q: '리뷰는 언제 작성할 수 있나요?',       a: '방문 후 이용 완료 상태가 되면 리뷰를 작성할 수 있어요. 내 예약 페이지에서 바로 작성 가능해요.' },
    { q: '원하는 가게가 없으면 어떻게 하나요?', a: '현재 지속적으로 입점 가게를 늘리고 있어요. 원하는 가게가 없다면 리뷰나 문의로 알려주세요!' },
    { q: '예약 확정은 얼마나 걸리나요?',        a: '가게의 자동 승인 설정과 운영 상황에 따라 달라요. 내 예약에서 신청·확정 상태를 확인할 수 있어요.' },
];
