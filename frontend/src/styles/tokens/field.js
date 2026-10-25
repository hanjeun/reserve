import { radius, heights } from './spacing';
import { colors } from './colors';
import { fontSize, fontWeight } from './typography';

/**
 * 같은 역할의 폼 입력이 공유하는 높이·반경·배경·글자·아이콘 토큰이다.
 * AntD 입력과 커스텀 날짜·시간 입력 및 대응 스켈레톤에서 같은 값을 참조한다.
 * 다른 역할의 버튼·필터·메뉴까지 이 입력 규격으로 통일하지 않는다.
 */
export const field = {
    /** 입력칸 높이. AntD size="large" 와 커스텀 자리표시자가 공유한다. */
    height: heights.input,          // '54px'
    /** 입력칸 모서리. AntD borderRadius 토큰과 같은 값이어야 한다. */
    radius: radius.lg,              // '14px'
    /** 채움형 배경. 비활성일 때는 한 단계 진하게. */
    bg: colors.gray[50],
    bgDisabled: colors.gray[100],
    /** 자리표시자 글자색 — AntD colorTextPlaceholder 와 같은 값. */
    placeholderColor: colors.text.placeholder,
    /* 날짜·시간 자리표시자는 측정한 같은 높이의 줄 상자를 사용한다. */
    textStyle: { fontSize: fontSize.lg, fontWeight: fontWeight.regular, lineHeight: 1.5,
        fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' },
    /**
     * 접미 아이콘 크기(px).
     * AntD 기본값을 그냥 두면 커스텀 자리표시자와 1~2px 어긋나는데,
     * 두 칸이 나란히 놓이므로 그 차이가 눈에 띈다("디자인이 미묘하게 다르다"의 정체).
     */
    iconSize: 16,
    /*
     * 채움형 입력 오류는 공통 안쪽 그림자로 표시해 필드 크기를 바꾸지 않는다.
     */
    errorRing: `inset 0 0 0 1px ${colors.error.main}`,
};

/** 숫자만 필요한 곳(Bone height 등)을 위한 px 제거 헬퍼. */
export const fieldPx = (v) => Number.parseInt(v, 10);

export default field;
