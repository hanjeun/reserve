import { colors } from '../../styles/tokens';

export const STORE_DATA = [
    {
        name: '모던 필라테스 스튜디오',
        category: '필라테스',
        rating: 4.9,
        reviewCount: 128,
        img: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80',
    },
    {
        name: '청담 헤어살롱 료',
        category: '헤어',
        rating: 4.8,
        reviewCount: 94,
        img: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=400&q=80',
    },
];

export const RESERVATION_DATA = [
    {
        storeName: '모던 필라테스 스튜디오',
        img: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80',
        date: '2026-03-15', time: '19:00', guestCount: 2, amount: 50000,
        statusLabel: '예약 확정', statusColor: colors.primary.main,
        actionLabel: '취소', actionVariant: 'ghost-sm-danger',
    },
    {
        storeName: '청담 헤어살롱 료',
        img: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=400&q=80',
        date: '2026-03-22', time: '20:00', guestCount: 4, amount: 80000,
        statusLabel: '이용 완료', statusColor: colors.success.main,
        actionLabel: '리뷰 쓰기', actionVariant: 'ghost-sm-primary',
    },
];

export const FAQS = [
    { q: '예약은 어떻게 하나요?',              a: '원하는 가게를 선택하고 날짜, 시간, 인원을 선택하면 바로 예약할 수 있어요. 회원가입 후 5분이면 충분해요.' },
    { q: '예약 취소는 가능한가요?',             a: '예약 확정 전이라면 내 예약 페이지에서 언제든지 취소할 수 있어요. 취소 후 보증금은 자동 환불됩니다.' },
    { q: '결제는 어떻게 이루어지나요?',         a: '카카오페이로 간편하게 결제할 수 있어요. 예약 보증금만 미리 결제되며, 나머지는 방문 후 직접 결제해요.' },
    { q: '리뷰는 언제 작성할 수 있나요?',       a: '방문 후 이용 완료 상태가 되면 리뷰를 작성할 수 있어요. 내 예약 페이지에서 바로 작성 가능해요.' },
    { q: '원하는 가게가 없으면 어떻게 하나요?', a: '현재 지속적으로 입점 가게를 늘리고 있어요. 원하는 가게가 없다면 리뷰나 문의로 알려주세요!' },
    { q: '예약 확정은 얼마나 걸리나요?',        a: '가게 사정에 따라 다르지만 보통 24시간 이내에 확정 또는 거절 알림을 받을 수 있어요.' },
];
