import { colors, fontSize, fontWeight } from '../../styles/tokens';

export const DEFAULT_GUIDE_PATH = '/guide/common';
export const GUIDE_PAGES = {
    '/guide/user': {
        title: '사용자 이용안내',
        description: '가게 찾기와 예약, 웨이팅 접수·QR 이용 방법을 안내해요.',
        sections: [
            { id: 'find', title: '가게 찾기' },
            { id: 'reservation', title: '예약하기' },
            { id: 'waiting', title: '웨이팅 접수하기' },
            { id: 'qr', title: 'QR로 방문 확인하기' },
            { id: 'history', title: '내역 확인과 문의' },
        ],
    },
    '/guide/business': {
        title: '사업자 이용안내',
        description: '가게 등록·수정과 예약·웨이팅·QR·광고·채팅 관리 방법을 안내해요.',
        sections: [
            { id: 'register', title: '사업자 계정과 가게 등록' },
            { id: 'edit', title: '가게 수정과 접수 방식' },
            { id: 'reservation', title: '예약 관리' },
            { id: 'waiting', title: '웨이팅 명단과 접수 중지' },
            { id: 'qr', title: '현장 접수 QR과 체크인' },
            { id: 'promotion', title: '광고와 채팅 관리' },
        ],
    },
    '/guide/common': {
        title: '공통 이용안내',
        description: '계정과 검색, 문의하기와 서비스 정책을 확인하는 방법을 안내해요.',
        sections: [
            { id: 'account', title: '계정 이용' },
            { id: 'search', title: '지역 선택과 최근 검색' },
            { id: 'help', title: '조회가 되지 않거나 도움이 필요할 때' },
            { id: 'policy', title: '정책과 권리 안내' },
        ],
    },
};

export const guidePageForPath = pathname => GUIDE_PAGES[pathname === '/operation-guide' ? DEFAULT_GUIDE_PATH : pathname];

export const guideStyles = {
    header: { marginBottom: 32 },
    title: { marginBottom: 12 },
    description: { marginBottom: 0 },
    navigation: { display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginBottom: 32, paddingBottom: 16, borderBottom: '1px solid ' + colors.border.light },
    navigationItem: { display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    section: { marginBottom: 32 },
    sectionTitle: { margin: '0 0 12px', color: colors.text.primary, fontSize: fontSize.lg, fontWeight: fontWeight.bold, lineHeight: 1.5 },
    body: { fontSize: fontSize.base, color: colors.text.secondary, lineHeight: 1.8 },
    paragraph: { margin: '0 0 12px' },
    links: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px' },
    link: { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold },
};
