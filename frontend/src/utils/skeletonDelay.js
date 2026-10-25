/*
 * 개발 환경에서 VITE_SKELETON_DELAY로 골격 표시 지연을 설정한다. 0이면 지연하지 않는다.
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
