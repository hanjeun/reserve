/**
 * RESERVE Design System - Skeleton Components
 *
 * shimmer 애니메이션 기반 스켈레톤 UI
 * 실제 카드 구조에 1:1 대응 — 위치 노가다 없이 데이터 영역만 교체
 *
 * 사용법:
 *   import { StoreCardSkeleton, ReservationCardSkeleton } from '../components/common';
 *
 *   if (isLoading) return <StoreCardSkeleton count={6} />;
 *   if (isLoading) return <ReservationCardSkeleton count={5} />;
 */

import React from 'react';
import PropTypes from 'prop-types';
import { colors, radius } from '../../styles/tokens';

/* ─────────────────────────────────────────────
   shimmer 키프레임 (전역 1회 주입)
───────────────────────────────────────────── */
const SHIMMER_STYLE = `
  @keyframes reserve-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }
  .reserve-skeleton-block {
    background: linear-gradient(
      90deg,
      ${colors.gray[100]} 25%,
      ${colors.gray[200]} 50%,
      ${colors.gray[100]} 75%
    );
    background-size: 800px 100%;
    animation: reserve-shimmer 1.4s ease-in-out infinite;
    border-radius: 6px;
  }
`;

let styleInjected = false;
const injectStyle = () => {
  if (styleInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.textContent = SHIMMER_STYLE;
  document.head.appendChild(el);
  styleInjected = true;
};

/* ─────────────────────────────────────────────
   기본 블록 (shimmer 적용된 div)
───────────────────────────────────────────── */
const Bone = ({ width = '100%', height = 14, style = {}, borderRadius }) => {
  injectStyle();
  return (
    <div
      className="reserve-skeleton-block"
      style={{
        width,
        height,
        flexShrink: 0,
        borderRadius: borderRadius ?? 6,
        ...style,
      }}
    />
  );
};

/* ─────────────────────────────────────────────
   StoreCardSkeleton
   StoreCard 구조: 커버이미지 + 태그 + 제목 + 별점
───────────────────────────────────────────── */
const StoreCardSkeleton = ({ count = 6, withActions = false }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      /* 실제 카드와 동일한 래핑 구조 — breakInside + marginBottom */
      <div key={i} style={{ breakInside: 'avoid', marginBottom: 24 }}>
        <div
          style={{
            borderRadius: 0,
            overflow: 'hidden',
            border: `1px solid ${colors.border.light}`,
            backgroundColor: colors.background.default,
          }}
        >
          {/* 커버 이미지 영역 */}
          <Bone height={200} borderRadius={0} />

          {/* 카드 바디 */}
          <div style={{ padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bone width={56} height={20} borderRadius={4} />
            <Bone width="70%" height={18} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Bone width={14} height={14} borderRadius={2} />
              <Bone width={28} height={14} />
              <Bone width={36} height={14} />
            </div>
          </div>
          {/* 액션바 (편집/삭제 아이콘 행) — withActions=true일 때만
               Ant Design Card actions: ul>li 구조로 각 li가 flex:1 + 수직 divider */}
          {withActions && (
            <div style={{
              borderTop: `1px solid ${colors.border.light}`,
              display: 'flex',
            }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: '12px 0',
                borderRight: `1px solid ${colors.border.light}`,
              }}>
                <Bone width={18} height={18} borderRadius={3} />
              </div>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: '12px 0',
              }}>
                <Bone width={18} height={18} borderRadius={3} />
              </div>
            </div>
          )}
        </div>
      </div>
    ))}
  </>
);

/* ─────────────────────────────────────────────
   ReservationCardSkeleton
   ReservationCard 구조: 60×60 이미지 + 정보(이름/메타/게스트) + 우측(배지/금액/버튼)
───────────────────────────────────────────── */
const ReservationCardItem = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0' }}>
    {/* 썸네일 */}
    <Bone width={60} height={60} borderRadius={radius.lg ?? 8} />

    {/* 중앙 정보 영역 */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <Bone width="45%" height={15} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Bone width={56} height={12} />
        <Bone width={72} height={12} />
        <Bone width={56} height={12} />
      </div>
      <Bone width={80} height={12} />
    </div>

    {/* 우측 상태/금액 */}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
      <Bone width={52} height={20} borderRadius={10} />
      <Bone width={64} height={15} />
    </div>
  </div>
);

const ReservationCardSkeleton = ({ count = 5 }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    {Array.from({ length: count }).map((_, i) => (
      <React.Fragment key={i}>
        <ReservationCardItem />
        {i < count - 1 && (
          <div style={{ height: 1, background: colors.border.light }} />
        )}
      </React.Fragment>
    ))}
  </div>
);

/* ─────────────────────────────────────────────
   MyReservationCardSkeleton
   마이페이지 예약카드 구조: 이미지 + 상태배지 + 가게명/날짜/인원/금액
───────────────────────────────────────────── */
const MyReservationCardSkeleton = ({ count = 4 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        style={{
          borderRadius: radius.lg ?? 8,
          border: `1px solid ${colors.border.light}`,
          padding: '16px',
          display: 'flex',
          gap: 14,
          backgroundColor: colors.background.default,
        }}
      >
        <Bone width={72} height={72} borderRadius={radius.lg ?? 8} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Bone width="50%" height={16} />
            <Bone width={56} height={20} borderRadius={10} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Bone width={80} height={12} />
            <Bone width={56} height={12} />
          </div>
          <Bone width={90} height={14} />
        </div>
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────
   ReviewCardSkeleton
───────────────────────────────────────────── */
const ReviewCardSkeleton = ({ count = 3 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{
        padding: '20px 20px 0 20px',
        backgroundColor: colors.background.default,
        borderRadius: 16,
        border: `1px solid ${colors.border.light}`,
        overflow: 'hidden',
      }}>
        {/* 헤더: 아바타 + 이름/별점 + 날짜 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bone width={38} height={38} borderRadius={19} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Bone width={72} height={13} />
              <Bone width={80} height={12} borderRadius={4} />
            </div>
          </div>
          <Bone width={32} height={12} />
        </div>

        {/* divider */}
        <div style={{ height: 1, backgroundColor: colors.border.light, margin: '14px 0' }} />

        {/* 본문: 제목 + 내용 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
          <Bone width="55%" height={14} />
          <Bone width="90%" height={13} />
          <Bone width="70%" height={13} />
        </div>

        {/* 액션바: 수정 | 삭제 — cardActions 구조와 동일 */}
        <div style={{
          display: 'flex',
          borderTop: `1px solid ${colors.border.light}`,
          margin: '0 -20px',
        }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <Bone width={40} height={13} />
          </div>
          <div style={{ width: 1, backgroundColor: colors.border.light }} />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <Bone width={32} height={13} />
          </div>
        </div>
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────
   StoreDetailSkeleton — PC/모바일 반응형
───────────────────────────────────────────── */
const DETAIL_BREAKPOINT = 900;

const InfoRowsSkeleton = () => (
  <>
    {[80, 60, 90, 72, 68].map((w, i) => (
      <div key={i} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 0',
        borderBottom: `1px solid ${colors.border.light}`,
      }}>
        <Bone width={14} height={14} borderRadius={2} style={{ flexShrink: 0 }} />
        <Bone width={72} height={13} style={{ flexShrink: 0 }} />
        <Bone width={`${w}%`} height={13} />
      </div>
    ))}
  </>
);

const FormFieldsSkeleton = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <Bone height={44} borderRadius={8} />
    <Bone height={44} borderRadius={8} />
    <Bone height={44} borderRadius={8} />
    <Bone height={80} borderRadius={8} />
    <Bone height={46} borderRadius={24} />
  </div>
);

const StoreDetailSkeleton = () => {
  const [isPC, setIsPC] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth >= DETAIL_BREAKPOINT : false
  );
  React.useEffect(() => {
    const h = () => setIsPC(window.innerWidth >= DETAIL_BREAKPOINT);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  if (isPC) return (
    <div>
      <Bone width={72} height={14} style={{ marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
        {/* 왼쪽 */}
        <div style={{ flex: '0 0 54%', maxWidth: 620, minWidth: 0 }}>
          <Bone height={360} borderRadius={12} style={{ marginBottom: 20 }} />
          <Bone width="50%" height={28} style={{ marginBottom: 20 }} />
          <InfoRowsSkeleton />
          <Bone height={1} borderRadius={0} style={{ margin: '20px 0' }} />
          <Bone width="30%" height={20} style={{ marginBottom: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{
                padding: 20, borderRadius: 12,
                border: `1px solid ${colors.border.light}`,
              }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <Bone width={38} height={38} borderRadius={19} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <Bone width="40%" height={13} />
                    <Bone width={80} height={12} borderRadius={4} />
                  </div>
                </div>
                <Bone width="55%" height={14} style={{ marginBottom: 8 }} />
                <Bone width="90%" height={13} />
              </div>
            ))}
          </div>
        </div>
        {/* 오른쪽: 예약폼 */}
        <div style={{
          flex: 1, minWidth: 300, maxWidth: 420,
          padding: '28px 24px', borderRadius: 12,
          border: `1px solid ${colors.border.light}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          <Bone width="55%" height={22} style={{ marginBottom: 24 }} />
          <FormFieldsSkeleton />
        </div>
      </div>
    </div>
  );

  // 모바일
  return (
    <div>
      <Bone width={72} height={14} style={{ marginBottom: 16 }} />
      <Bone height={260} borderRadius={0} style={{ margin: '0 -16px', width: 'calc(100% + 32px)' }} />
      <Bone width="55%" height={28} style={{ marginTop: 20, marginBottom: 16 }} />
      <InfoRowsSkeleton />
      <Bone height={1} borderRadius={0} style={{ margin: '20px 0' }} />
      <Bone width="45%" height={22} style={{ marginBottom: 20 }} />
      <FormFieldsSkeleton />
    </div>
  );
};

/* ─────────────────────────────────────────────
   FavoriteCardSkeleton
   FavoriteCard 구조: 64×64 이미지 + 가게명/별점/카테고리 + 우측 버튼
───────────────────────────────────────────── */
const FavoriteCardSkeleton = ({ count = 5 }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '18px 0',
          borderBottom: `1px solid ${colors.border.light}`,
        }}
      >
        {/* 이미지 */}
        <Bone width={64} height={64} borderRadius={radius.lg ?? 8} />
        {/* 정보 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Bone width="50%" height={15} />
          <div style={{ display: 'flex', gap: 6 }}>
            <Bone width={80} height={12} />
            <Bone width={32} height={12} />
          </div>
          <Bone width={56} height={18} borderRadius={10} />
        </div>
        {/* 버튼 */}
        <Bone width={60} height={28} borderRadius={6} />
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────
   AdminTableSkeleton
   AdminPanel 테이블 로우 형식 스켈레톤
───────────────────────────────────────────── */
const AdminTableSkeleton = ({ rows = 8, cols = [160, 140, 120, 100, 90, 180] }) => (
  <div
    style={{
      border: `1px solid ${colors.gray[100]}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}
  >
    {/* 헤더 행 */}
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '12px 16px',
        background: colors.gray[50],
        borderBottom: `1px solid ${colors.gray[100]}`,
      }}
    >
      {cols.map((w, i) => (
        <Bone key={i} width={i === cols.length - 1 ? 60 : Math.min(w * 0.45, 80)} height={13} />
      ))}
    </div>
    {/* 데이터 행들 */}
    {Array.from({ length: rows }).map((_, ri) => (
      <div
        key={ri}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 16px',
          borderBottom: ri < rows - 1 ? `1px solid ${colors.gray[100]}` : 'none',
          background: colors.background.default,
        }}
      >
        {/* 첫 콼럼: 이름 + 이메일 스택 */}
        <div style={{ width: cols[0], flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Bone width="70%" height={13} />
          <Bone width="85%" height={11} />
        </div>
        {/* 나머지 콼럼 */}
        {cols.slice(1, -1).map((w, ci) => (
          <div key={ci} style={{ width: w, flexShrink: 0 }}>
            <Bone width={`${50 + (ci % 3) * 15}%`} height={13} />
          </div>
        ))}
        {/* 마지막 콼럼: 버튼들 */}
        <div style={{ flex: 1, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Bone width={32} height={26} borderRadius={4} />
          <Bone width={52} height={26} borderRadius={4} />
          <Bone width={52} height={26} borderRadius={4} />
        </div>
      </div>
    ))}
  </div>
);

Bone.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  style: PropTypes.object,
  borderRadius: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

StoreCardSkeleton.propTypes = {
  count: PropTypes.number,
  withActions: PropTypes.bool,
};

ReservationCardSkeleton.propTypes = {
  count: PropTypes.number,
};

MyReservationCardSkeleton.propTypes = {
  count: PropTypes.number,
};

ReviewCardSkeleton.propTypes = {
  count: PropTypes.number,
};

FavoriteCardSkeleton.propTypes = {
  count: PropTypes.number,
};

AdminTableSkeleton.propTypes = {
  rows: PropTypes.number,
  cols: PropTypes.arrayOf(PropTypes.number),
};

export {
  Bone,
  StoreCardSkeleton,
  ReservationCardSkeleton,
  MyReservationCardSkeleton,
  FavoriteCardSkeleton,
  AdminTableSkeleton,
  ReviewCardSkeleton,
  StoreDetailSkeleton,
};
