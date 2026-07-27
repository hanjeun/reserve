import React from 'react';
import PropTypes from 'prop-types';
import { colors } from '../../styles/tokens';

/**
 * RESERVE Design System - Loading Spinner (Material 호 방식)
 *
 * 2026-07 재작업: 기존 CSS border 링(등속 회전)을 Material Design 스타일 SVG 호 스피너로 교체.
 * 트랙(배경 원)은 그대로 두고, 그 위 호(arc)가 등속으로 돌면서 동시에 길이가 늘었다 줄었다 해서
 * "빨라졌다 느려지는" 완급 느낌을 준다. reserve-spin(전체 회전) + reserve-arc-dash(호 길이 변화)
 * 두 키프레임을 함께 쓰며, 둘 다 App.jsx <style>에 전역 주입돼 있다.
 *
 * ArcSpinner    — 재사용 가능한 호 스피너 자체. size/stroke/color/track를 받는다.
 *                 (주소 검색창 등 인라인 스피너도 이걸 재사용 — 스피너 구현을 한 곳으로 통일)
 * SpinIndicator — 1em/currentColor 기반. AntD <Spin>의 기본 인디케이터 교체용
 *                 (App.jsx: <ConfigProvider spin={{ indicator: <SpinIndicator /> }}>).
 * Loading       — 페이지/섹션 중앙 정렬 래퍼(fullPage / section).
 */

// SVG 뷰박스 50x50, r=20 → 둘레 ≈ 126. 아래 dash 값은 이 둘레(126)를 기준으로 잡았다.
const VIEWBOX = 50;
const R = 20;

/**
 * 재사용 호(arc) 스피너.
 * @param size         px 숫자 또는 '1em' 같은 CSS 길이 문자열
 * @param stroke       뷰박스(50) 좌표계 기준 선 굵기
 * @param color        호(진행) 색
 * @param track        트랙(배경 원) 색
 * @param trackOpacity 트랙 불투명도 (currentColor 트랙을 옅게 쓸 때)
 */
export const ArcSpinner = ({
  size = 36,
  stroke = 4,
  color = colors.primary.main,
  track = colors.gray[100],
  trackOpacity = 1,
}) => (
  <svg
    viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
    width={size}
    height={size}
    role="img"
    aria-label="로딩 중"
    style={{
      display: 'block',
      flexShrink: 0,
      transformOrigin: 'center',
      transformBox: 'fill-box',
      animation: 'reserve-spin 2s linear infinite',
    }}
  >
    <circle
      cx={VIEWBOX / 2}
      cy={VIEWBOX / 2}
      r={R}
      fill="none"
      stroke={track}
      strokeOpacity={trackOpacity}
      strokeWidth={stroke}
    />
    <circle
      cx={VIEWBOX / 2}
      cy={VIEWBOX / 2}
      r={R}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      style={{ animation: 'reserve-arc-dash 1.5s ease-in-out infinite' }}
    />
  </svg>
);

ArcSpinner.propTypes = {
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  stroke: PropTypes.number,
  color: PropTypes.string,
  track: PropTypes.string,
  trackOpacity: PropTypes.number,
};

/**
 * AntD <Spin>(및 Table loading)의 기본 인디케이터(점 4개)를 대체하는 호 스피너.
 * 1em + currentColor 기반이라 붙는 위치의 크기/색을 그대로 따라간다.
 */
export const SpinIndicator = () => (
  <ArcSpinner size="1em" stroke={5} color="currentColor" track="currentColor" trackOpacity={0.25} />
);

const Loading = ({
  fullPage  = false,
  size      = 36,
  thickness = 3,
  color     = colors.primary.main,
  minHeight = '240px',
}) => {
  // px 굵기를 뷰박스(50) 좌표계 굵기로 환산 — 어느 size에서도 굵기 비율이 일정하게 유지된다.
  const strokeVB = (thickness * VIEWBOX) / size;
  const ring = <ArcSpinner size={size} stroke={strokeVB} color={color} track={colors.gray[100]} />;

  if (fullPage) {
    return (
      <div
        style={{
          position:        'fixed',
          inset:           0,
          display:         'flex',
          justifyContent:  'center',
          alignItems:      'center',
          backgroundColor: colors.background.default,
          zIndex:          9999,
        }}
      >
        {ring}
      </div>
    );
  }

  return (
    <div
      style={{
        display:        'flex',
        justifyContent: 'center',
        alignItems:     'center',
        minHeight,
        width:          '100%',
      }}
    >
      {ring}
    </div>
  );
};

Loading.propTypes = {
  fullPage: PropTypes.bool,
  size: PropTypes.number,
  thickness: PropTypes.number,
  color: PropTypes.string,
  minHeight: PropTypes.string,
};

export default Loading;
