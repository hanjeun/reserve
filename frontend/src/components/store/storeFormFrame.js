import { heights, radius, spacing } from '../../styles/tokens';

// 가게 등록·수정 폼의 바깥 틀(폭·여백·제목 간격·밀도 변수) 관문.
// 실제 폼(StoreForm)과 로딩 뼈대(StoreFormSkeleton)가 같은 값을 쓰게 한 곳에서 정한다 —
// 예전엔 뼈대가 자기 여백·폭을 따로 들고 있어 로딩이 끝나는 순간 제목·첫 칸이 수십 px 튀었다(2026-09-29 실측).
export const STORE_FORM_MOBILE_MAX = 767;
export const STORE_FORM_SINGLE_COLUMN_MAX = 899;

/** 모바일 작업 폼 밀도. store-form-layout.css 의 입력 높이·간격 규칙이 이 변수를 읽는다. */
export const STORE_FORM_DENSITY_VARS = Object.freeze({
    '--reserve-store-form-control-height': heights.buttonMd,
    '--reserve-store-form-control-radius': radius.md,
    '--reserve-store-form-field-gap': spacing[4],
    '--reserve-store-form-label-gap': spacing[3],
});

export const STORE_FORM_COPY = Object.freeze({
    create: { title: '가게 등록', subtitle: '가게 정보를 입력하고 예약을 받아보세요.' },
    edit: { title: '가게 정보 수정', subtitle: '등록된 가게 정보를 수정해요.' },
});

/** 창 폭에 따른 폼 틀. isMobile(<768)은 한 줄 쌓기·작은 입력, isSingleColumn(<900)은 두 컬럼을 한 컬럼으로 합친다. */
export function storeFormFrame(width) {
    const isMobile = width <= STORE_FORM_MOBILE_MAX;
    // 768~899px에서 두 주요 컬럼 안에 시간 범위 두 칸을 다시 쪼개면 입력 폭이 부족하다.
    const isSingleColumn = width <= STORE_FORM_SINGLE_COLUMN_MAX;
    let size = 'lg';
    if (isMobile) size = 'sm';
    else if (isSingleColumn) size = 'md';
    return {
        isMobile,
        isSingleColumn,
        container: {
            size,
            paddingTop: isMobile ? spacing[6] : spacing[10],
            paddingX: isMobile ? spacing[5] : spacing[7],
            paddingBottom: isMobile ? spacing[9] : spacing[12],
        },
        headingGap: isMobile ? spacing[6] : spacing[10],
    };
}
