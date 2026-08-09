import { colors, fontWeight, radius, shadows, heights, transitions, fontSize, withAlpha } from '../../styles/tokens';

/**
 * 홈 기능 섹션 목업의 **공통 폭**.
 *
 * 예전에는 목업마다 maxWidth 가 달랐다 — MockBookingForm 360 / MockStoreList 380 /
 * MockMyReservations 400. 칸이 늘어나면 목업은 자기 maxWidth 까지만 커지고 나머지는
 * `justifyContent: center` 로 좌우에 여유로 남는데, 그 여유가 글과 목업 사이 간격에
 * 더해져서 **섹션마다 간격이 달라 보였다**(사용자 지적). 아이패드 폭에서 특히 심했다.
 *
 * 세 목업의 폭을 하나로 맞추고 칸의 flex-basis 도 같은 값으로 두면,
 * 목업이 칸을 정확히 채우므로 여유가 0 이 되고 간격은 항상 gap 그대로다.
 *
 * ⚠️ 목업 컴포넌트(sections/mockups/Mock*.jsx)의 maxWidth 와 **반드시 같은 값**이어야 한다.
 *    한쪽만 바꾸면 여유가 생겨 간격이 다시 어긋난다.
 */
export const HOME_MOCKUP_WIDTH = 380;

export const styles = {
    homeWrapper: {
        backgroundColor: colors.background.default,
        overflowX: 'hidden',
    },
    contentArea: {
        minHeight: `calc(100svh - ${heights.header})`,
        padding: '0 24px',
        gap: 0,
        position: 'relative',
        boxSizing: 'border-box',
    },
    badge: {
        backgroundColor: colors.gray[100],
        padding: '6px 16px',
        borderRadius: radius.pill,
        color: colors.primary.main,
        fontWeight: fontWeight.bold,
        marginBottom: 28,
        fontSize: 14,
    },
    titleContainer: { marginBottom: 20 },
    mainTitle: {
        fontSize: 'clamp(36px, 6vw, 64px)',
        fontWeight: fontWeight.extrabold,
        color: colors.text.primary,
        textAlign: 'center',
        lineHeight: 1.3,
        margin: 0,
        letterSpacing: '-1px',
    },
    lineWrapper: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '1.35em',
        whiteSpace: 'pre',
    },
    subTitle: {
        fontSize: 'clamp(15px, 2.5vw, 18px)',
        color: colors.text.secondary,
        textAlign: 'center',
        lineHeight: 1.7,
        fontWeight: fontWeight.medium,
        display: 'block',
    },
    heroBtn: {
        height: heights.buttonHero,
        padding: '0 44px',
        fontSize: 18,
        fontWeight: fontWeight.bold,
        borderRadius: radius.pill,
        boxShadow: shadows.buttonHover,
        border: 'none',
        backgroundColor: colors.primary.main,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        transition: `all ${transitions.fast} ${transitions.easing}`,
        cursor: 'pointer',
    },

    // ── PC 섹션 ──
    section: {
        minHeight: `calc(100svh - ${heights.header})`,
        scrollMarginTop: heights.header,
        padding: '0 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        boxSizing: 'border-box',
    },
    sectionBody: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionInner: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 80,
        maxWidth: 1000,
        width: '100%',
        margin: '0 auto',
        flexWrap: 'wrap',
    },
    // flex-basis 400 (예전 340).
    //
    // sectionInner는 flexWrap:'wrap'인데, 예전 값에서는 그 wrap이 사실상 발동한 적이 없었다.
    //   basis 합 = 340(text) + 300(UI) + gap 80 = 720px
    //   Home의 모바일 경계가 768 "이하"라 PC 분기의 최소 폭은 769px → 안쪽 폭 769-48 = 721px
    //   720 ≤ 721 — 딱 1px 차이로 항상 한 줄에 들어가 버린다.
    // 그래서 769~1000px 구간 내내 2단이 억지로 유지되고 목업(maxWidth 380)이 300px까지 눌렸다.
    // 태블릿 세로(768~830)가 정확히 이 구간이다.
    //
    // 400으로 올리면 basis 합이 780이 되어 안쪽 폭 780 미만(= 뷰포트 828 미만)에서 정상적으로
    // 줄바꿈되고, 두 블록이 각자 온전한 폭을 갖는다.
    //
    // 폰·노트북 영향 없음(확인함):
    //   - 폰(≤430): 애초에 isMobile 분기라 이 스타일을 안 탄다
    //   - 노트북(≥1280): 안쪽 폭이 maxWidth 1000으로 고정 → 780보다 넓어 2단 유지, 결과 동일
    //   - 912(Surface Pro) 실측: 안쪽 864px에서 text 412 / UI 372로 2단 유지 — 여기도 그대로다
    /**
     * ★ 2026-08-06 — 두 열의 flex-grow 를 0으로 바꿨다. 간격이 섹션마다 달라 보이던 원인이다.
     *
     * 예전: sectionText `1 1 400px` / sectionUI `1 1 300px` — **둘 다 grow: 1**
     *   1000px 컨테이너에서 남는 폭을 두 열이 나눠 가진다. 그런데 sectionUI 안의 목업은
     *   자체 maxWidth 가 있어서, 넓어진 칸 안에서 `justifyContent: center` 로 가운데 정렬된다.
     *   → 목업 폭이 섹션마다 다르면 **칸 안에 남는 여유(slack)도 달라지고**,
     *     그 여유가 글과 목업 사이에 더해져 "간격이 섹션별로 다르다"가 된다.
     *     넓은 목업이 있는 섹션은 붙어 보이고, 좁은 목업이 있는 섹션은 양 끝으로 벌어져 보였다.
     *
     * 지금: grow 를 0으로 두면 두 열이 각자 내용만큼만 차지하고, 부모의
     *   `justifyContent: center` 가 둘을 가운데로 모은다. 그러면 글과 목업 사이는
     *   **항상 정확히 gap(80px)** 이고 남는 폭은 좌우 바깥쪽으로 균등하게 빠진다.
     *   → 모든 섹션에서 같은 간격, 아이패드 가로폭에서도 "따로 노는" 현상이 사라진다.
     *
     * shrink 는 1로 남긴다 — 좁아지면 줄어들다가 flexWrap 으로 세로 적층된다.
     */
    sectionText: { flex: '0 1 420px', maxWidth: 420 },
    /**
     * ★ flex-basis 를 **명시적인 px** 로 준다. `auto` 로 두면 안 된다.
     *   목업들은 안에서 `width: 100%; maxWidth: N` 을 쓰는데, 칸의 basis 가 auto 면
     *   그 100% 가 기댈 기준이 없어 **내용 폭(min-content)으로 붕괴한다** — 목업이 짜부된다.
     *   (2026-08-06에 `0 1 auto` 로 뒀다가 실제로 그렇게 눌렸다: 380/237/301px)
     *
     * ★ shrink 도 0 이다. 좁아질 때 목업이 먼저 눌리면 기기 프레임 목업이 찌그러져 보인다.
     *   대신 sectionText 가 shrink 1 이라 글 쪽이 먼저 줄고, 그래도 부족하면 flexWrap 이
     *   세로 적층으로 넘긴다. 우선순위: 목업 온전함 > 글 폭.
     */
    sectionUI: { flex: `0 0 ${HOME_MOCKUP_WIDTH}px`, display: 'flex', justifyContent: 'center' },

    // ── 모바일 섹션 ──
    sectionMobile: {
        // minHeight 복원: 모바일에서도 섹션이 화면을 꽉 채워야 V버튼 클릭 시 다음 섹션 침범 없이 깔끔함
        // overscroll-behavior-y: none은 이미 제거했으므로 스크롤 고정 느낙 없음
        minHeight: `calc(100svh - ${heights.header})`,
        scrollMarginTop: heights.header,
        padding: '60px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxSizing: 'border-box',
        position: 'relative',
    },
    sectionBodyMobile: {
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
    },
    sectionTextMobile: { width: '100%' },
    sectionTitleMobile: {
        fontSize: 'clamp(22px, 6vw, 32px)',
        fontWeight: fontWeight.extrabold,
        color: colors.text.primary,
        lineHeight: 1.3,
        letterSpacing: '-0.5px',
        margin: '0 0 12px',
    },

    // ── 공통 화살표 ──
    sectionArrow: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
    },

    // ── 공통 태그/포인트 ──
    sectionTag: {
        display: 'inline-block',
        background: withAlpha(colors.primary.main),
        color: colors.primary.main,
        fontWeight: fontWeight.bold,
        fontSize: 13,
        padding: '4px 12px',
        borderRadius: radius.pill,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 'clamp(26px, 4vw, 40px)',
        fontWeight: fontWeight.extrabold,
        color: colors.text.primary,
        lineHeight: 1.3,
        letterSpacing: '-0.5px',
        margin: '0 0 14px',
    },
    pointList: { display: 'flex', flexDirection: 'column', gap: 10 },
    pointRow: { display: 'flex', alignItems: 'center', gap: 10 },
};

// 목업 공통 스타일
export const mockInputBase = {
    display: 'flex',
    alignItems: 'center',
    height: heights.input,
    background: colors.gray[50],
    borderRadius: radius.lg,
    padding: '0 16px',
    fontSize: '14px',
    color: colors.text.primary,
    boxSizing: 'border-box',
    border: 'none',
};

export const mockFormLabel = {
    display: 'block',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: 8,
    paddingLeft: 4,
};
