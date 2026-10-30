import { colors, radius, shadows, fontSize, fontWeight } from '../../styles/tokens';

const styles = {
    // PC 2단 (900px 이상)
    // StoreDetail의 pcLeft/pcRight와 같은 구조. gap 32는 두 카드 묶음이 서로 다른 영역으로
    // 읽히기에 충분하면서, 1000px 컨테이너에서 양쪽이 좁아지지 않는 값이다.
    pcGrid:  { display: 'flex', gap: 32, alignItems: 'flex-start' },
    // basis 420/300 — 아이패드 세로(768)에서도 두 열이 들어가는 값이다(위 isPC 주석의 계산 참고).
    // 넓은 화면에서는 grow로 자연스럽게 벌어지고 pcRight의 maxWidth가 오른쪽 폭을 잡아준다.
    pcLeft:  { flex: '1 1 420px', minWidth: 0 },
    // sticky — 왼쪽 탭(위치/사업자 등)이 길어져도 설정이 화면에 남는다.
    // top 80은 고정 헤더(64) + 여백. alignSelf: flex-start가 없으면 flex가 높이를 늘려 sticky가 안 먹는다.
    pcRight: { flex: '1 1 300px', minWidth: 280, maxWidth: 420, position: 'sticky', top: 80, alignSelf: 'flex-start' },

    // 디자인 섹션 — 라벨(왼쪽)과 컨트롤(오른쪽)이 한 줄. 좁아지면 컨트롤이 아래로 내려간다.
    designRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', padding: '4px 0',
    },
    designLabel: { minWidth: 0, flex: '1 1 auto' },
    // 글꼴·포인트 색을 한 줄에 2개. 최소 폭을 두어 좁아지면 자동으로 1열이 된다
    // (미디어쿼리 없이 auto-fit + minmax 로 처리 — 브레이크포인트를 하나 더 만들 이유가 없다).
    designGrid: {
        display: 'grid',
        // 2열 고정이다. auto-fit + minmax(200px) 로 뒀더니 이 카드 폭에서 최소폭을 못 채워
        //   1열로 접히고 결과적으로 2줄이 됐다 — "한 줄에 2개, 작게"가 요구사항이므로 고정한다.
        //   좁아지면 각 칸이 함께 좁아질 뿐 줄이 늘지 않는다(가게 등록 폼도 모바일에서 2열을 유지한다).
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 12,
        padding: '4px 0',
    },

    profileHeader: {
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '20px 24px',
        backgroundColor: colors.background.paper,
        borderRadius: radius['2xl'],
        border: `1px solid ${colors.border.light}`,
        boxShadow: shadows.card,
        marginBottom: 24,
    },
    userName: {
        display: 'block', fontSize: fontSize.lg,
        fontWeight: fontWeight.bold, color: colors.text.primary, lineHeight: 1.4,
    },
    userEmail: { display: 'block', fontSize: fontSize.sm, color: colors.text.tertiary },
    userRole: {
        display: 'block', fontSize: fontSize.xs,
        color: colors.primary.main, fontWeight: fontWeight.semibold, marginTop: 2,
    },
    tabsCard: {
        backgroundColor: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius['2xl'],
        padding: '20px',
        boxShadow: shadows.card,
        marginBottom: 8,
    },
    sectionTitle: {
        display: 'block', fontSize: fontSize.base,
        fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 16,
    },
    tabLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    loginMethodLabel: { minWidth: 0, padding: '8px 0', overflowWrap: 'anywhere' },
    loginMethodActions: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '8px 0' },
    loginMethodHint: { display: 'block', fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 4 },
    securityNotice: {
        display: 'flex', alignItems: 'center', gap: 6,
        backgroundColor: colors.primary.light,
        borderRadius: radius.lg, padding: '8px 12px', marginBottom: 16,
    },
    deleteSection: {
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
        padding: '20px 24px',
        backgroundColor: colors.background.paper,
        borderRadius: radius['2xl'],
        border: `1px solid ${colors.error.light}`,
        boxShadow: shadows.card,
    },
    notificationSection: {
        backgroundColor: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius['2xl'],
        padding: '20px 24px',
        boxShadow: shadows.card,
    },
    notifRow: {
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
        padding: '8px 0',
    },
};

export default styles;
