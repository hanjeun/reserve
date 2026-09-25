/**
 * RESERVE Design System - Chart Tokens
 *
 * 관리자 대시보드 + 사업자 통계 탭이 공유하는 Recharts 스타일 프리셋.
 * 2026-07: 기본 AntD Card+Statistic, CartesianGrid strokeDasharray 격자선 노출 등
 * 각진 느낌을 벗어나 둥근 카드 + 컬러 아이콘 배지 + 부드러운 차트로 리디자인.
 */
import { colors } from './colors';

// 파이/바 차트 팔레트 — 브랜드 토큰 우선, 토큰에 없는 보조색만 추가
export const chartPalette = [
  colors.primary.main,
  colors.success.main,
  colors.warning.main,
  colors.error.main,
  '#8b5cf6', // 보조색 (토큰에 없는 purple)
  '#06b6d4', // 보조색 (토큰에 없는 cyan)
];

// CartesianGrid — 세로선 없이 가로선만 아주 연하게 (각진 격자 느낌 제거)
export const chartGridProps = {
  horizontal: true,
  vertical: false,
  stroke: colors.gray[100],
};

export const chartAxisTick = { fontSize: 11, fill: colors.text.tertiary };

/**
 * 차트 바깥 여백 — 모든 Recharts 차트가 이 하나만 쓴다.
 *
 * 관문 규칙: margin.left 는 절대 음수로 만들지 않는다. Y축 라벨 폭은 아래
 * chartYAxisWidth 로만 조절한다. 음수 margin 은 Y축 전체를 카드 안쪽으로
 * 끌어당겨 라벨이 잘리고, 차트마다 값이 달라지면(-20 vs 0) 같은 화면에
 * 나란히 놓인 그래프들의 시작 위치가 서로 어긋나 제목과도 정렬이 안 맞는다.
 */
export const chartMargin = { top: 8, right: 12, bottom: 4, left: 0 };

/**
 * Y축이 차지하는 가로 폭. Recharts 기본값은 60px인데 "0~99" 같은 짧은 눈금엔
 * 지나치게 넓어서 그래프 본문이 오른쪽으로 밀려 보인다(왼쪽 여백 40px vs 오른쪽 8px).
 * 눈금 라벨 길이에 맞춰 고른다.
 *   count    — 건수/개수 등 짧은 정수 눈금
 *   currency — "120k" 같은 축약 금액 눈금
 */
export const chartYAxisWidth = { count: 30, currency: 42 };

// Tooltip — 카드와 동일한 톤(둥근 모서리 + 은은한 그림자)
export const chartTooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: `1px solid ${colors.border.light}`,
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    fontSize: 13,
    padding: '8px 12px',
  },
  cursor: { fill: colors.gray[50] },
};

// Bar 차트 막대 radius — 기존 [4,4,0,0]보다 더 둥글게
export const chartBarRadius = [8, 8, 0, 0];

// Pie/Donut 차트 조각 radius — 둥근 도넛 느낌
export const chartPieCornerRadius = 6;

// Area 차트 그라데이션 fill용 헬퍼 — <defs><linearGradient id={id}>...</linearGradient></defs>에 사용
export const chartAreaGradient = (id, color) => ({
  id,
  stops: [
    { offset: '5%', stopColor: color, stopOpacity: 0.35 },
    { offset: '95%', stopColor: color, stopOpacity: 0.02 },
  ],
});
