/**
 * 스켈레톤 테스트용 딜레이 유틸리티
 *
 * 사용법:
 *   1. .env 파일에 추가:
 *      VITE_SKELETON_DELAY=3000
 *
 *   2. 테스트 끝나면 제거하거나 0으로:
 *      VITE_SKELETON_DELAY=0
 *
 * ※ import.meta.env.DEV 조건으로 개발 환경에서만 동작
 */

const DELAY_MS = Number(import.meta.env.VITE_SKELETON_DELAY ?? 0);

/**
 * axios request interceptor에 주입할 딜레이 함수
 * axios.js에서 사용
 */
export const skeletonDelayInterceptor = async (config) => {
  if (import.meta.env.DEV && DELAY_MS > 0) {
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }
  return config;
};
