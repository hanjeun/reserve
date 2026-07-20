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
