// 사업자 인증 표의 뼈대 모양 — 탭(BusinessVerificationTab)의 데이터 로딩과 관리자 패널 청크 로딩 뼈대가 함께 쓴다.
// 실제 컬럼 정의와 같은 값을 유지해야 로딩 뒤 셀 경계가 밀리지 않는다.
export const BUSINESS_VERIFICATION_SKELETON_HEADERS = Object.freeze(['신청자', '상호명', '사업자번호', '신청일', '상태', '처리']);
export const BUSINESS_VERIFICATION_SKELETON_COLS = Object.freeze([200, 130, 110, 100, 90, 260]);
// 총 건수를 모를 때(첫 로딩) 그리는 행 수 — skeletonRowCount 의 기본값과 같다.
export const BUSINESS_VERIFICATION_SKELETON_ROWS = 8;
