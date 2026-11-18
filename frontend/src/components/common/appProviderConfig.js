import { theme as antdTheme } from 'antd';
import { colors, fontWeight, fontSize, rawColors, semanticActionPalettes, field, fieldPx, zIndex } from '../../styles/tokens';

export const appMessageConfig = { maxCount: 3, styles: {
    list: { willChange: 'auto' }, listContent: { willChange: 'auto', pointerEvents: 'none' },
    root: { willChange: 'auto', backfaceVisibility: 'visible' },
    title: { color: colors.text.primary, fontWeight: fontWeight.medium, fontSize: fontSize.base, lineHeight: '24px' },
} };

export const validateMessages = {
    required: '${label}을(를) 입력해주세요.',
    types: {
        email: '올바른 이메일 형식이 아니에요.',
        number: '숫자를 입력해주세요.',
    },
    string: {
        min: '최소 ${min}자 이상 입력해주세요.',
        max: '최대 ${max}자까지 입력할 수 있어요.',
    },
};

const buildNeutralFocus = isDark => ({
    activeBorderColor: isDark ? '#8b939e' : rawColors.gray[500],
    hoverBorderColor: isDark ? '#5c636d' : rawColors.gray[400],
    activeShadow: 'none',
});

/*
 * AntD는 JS에서 파생색·글꼴을 계산하므로 CSS 변수 대신 색 리터럴과 글꼴 상속을 사용한다. 테마 변경은 AntD 알고리즘에도 별도로 반영한다.
 */
/**
 * @param isDark   다크 모드인지
 * @param accent   사용자가 고른 포인트 색의 **리터럴 hex** (useTheme 의 accentColors).
 *                 AntD 토큰은 CSS 변수를 못 받는다 — AntD 가 JS 로 파생색을 계산하기 때문이다.
 *                 그래서 CSS 쪽(--c-primary)과 여기(colorPrimary)를 각각 넣어야 하고,
 *                 둘 다 같은 출처(ACCENT_OPTIONS)에서 나오므로 어긋나지 않는다.
 */
export const buildThemeConfig = (isDark, accent) => {
    const neutralFocus = buildNeutralFocus(isDark);
    const semantic = semanticActionPalettes[isDark ? 'dark' : 'light'];
    return {
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
            colorPrimary: accent.main,
            colorBgContainer: isDark ? '#1e2126' : '#ffffff',
            colorBorder: isDark ? '#2d3138' : rawColors.gray[100],
            borderRadius: fieldPx(field.radius),
            // 고정 헤더·메신저보다 위에 모달을 두어 입력·결제 도구를 가리지 않는다.

            zIndexPopupBase: zIndex.modal,
            // 검증 메시지·테두리·아이콘은 같은 의미별 색 리터럴을 사용한다.

            colorError: semantic.error.main,
            colorWarning: isDark ? '#ffc633' : '#ffb800',
            // 다크 배경의 자리표시자·비활성 문구 대비를 보정하고 라이트 기본값은 유지한다.

            colorTextPlaceholder: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.25)',
            colorTextDisabled:    isDark ? 'rgba(255, 255, 255, 0.38)' : 'rgba(0, 0, 0, 0.25)',
            // 사용자가 선택한 글꼴을 body에서 상속한다.

            fontFamily: 'inherit',
        },
        components: {
            Tooltip: {
                colorBgSpotlight: isDark ? '#ffffff' : '#1a1f27',
                colorTextLightSolid: isDark ? '#1a1f27' : '#ffffff',
                borderRadius: 10,
            },
            Button: {
                primaryColor: accent.foreground,
                colorPrimaryHover: accent.solidHover,
                colorPrimaryActive: accent.solidHover,
                dangerColor: semantic.error.foreground,
                colorError: semantic.error.solid,
                colorErrorHover: semantic.error.solidHover,
                colorErrorActive: semantic.error.solidHover,
                colorPrimary: accent.solid,
                borderRadius: 16,
                borderRadiusSM: 10,
                borderRadiusLG: 16,
            },
            // 입력 포커스는 같은 중립 테두리를 사용한다.

            Input: {
                colorBgContainer: isDark ? '#23262b' : rawColors.gray[50],
                ...neutralFocus,
            },
            InputNumber: { ...neutralFocus },
            DatePicker: { ...neutralFocus },
            // 채움형 입력은 gray[50], 비활성 입력은 gray[100]을 사용한다.

            Select: {
                colorBgContainer: isDark ? '#23262b' : rawColors.gray[50],
                colorBgElevated: isDark ? '#1e2126' : '#ffffff',
                optionSelectedBg: isDark ? '#2d3138' : rawColors.gray[200],
                activeBorderColor: neutralFocus.activeBorderColor,
                hoverBorderColor: neutralFocus.hoverBorderColor,
                activeOutlineColor: 'transparent',
            },
            // 카드 하단 도구는 전용 actionsBg 토큰을 사용한다.

            Card: {
                actionsBg: isDark ? '#1e2126' : '#ffffff',
            },
            Tabs: {
                inkBarColor: accent.main,
                horizontalItemGutter: 24,
                itemColor: isDark ? '#8b939e' : rawColors.gray[500],
                itemHoverColor: isDark ? '#e8eaed' : rawColors.gray[900],
                itemSelectedColor: accent.main,
                colorBorderSecondary: isDark ? '#23262b' : rawColors.gray[100],
            },
        },
    };
};
