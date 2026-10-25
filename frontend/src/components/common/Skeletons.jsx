/*
 * 골격은 실제 목록·카드의 행 배치·구분선·간격을 공유하고 물결 효과는 전역 규칙에서 처리한다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { colors, radius } from '../../styles/tokens';
import Bone from './Bone';
import StoreDetailSkeleton, { ReviewCardSkeleton } from './StoreDetailSkeleton';
import StoreCardSkeleton from './StoreCardSkeleton';

/* 골격 물결 효과는 전역 components-and-forms.css에서만 정의한다. */
/*
 * 항목 순서가 고정된 골격은 안정된 문자열 키를 재사용한다.
 */
const skeletonKeys = (n, prefix = 'sk') => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

/*
 * 고객·사업자의 같은 예약 행 구조는 골격도 공유한다.
 */
const useIsWideRow = (breakpoint = 576) => {
  const [isWide, setIsWide] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth >= breakpoint : true
  );
  React.useEffect(() => {
    const h = () => setIsWide(window.innerWidth >= breakpoint);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [breakpoint]);
  return isWide;
};

const ReservationRowSkeletonItem = ({ isWide, actionCount = 2 }) => {
  // 액션 골격의 크기와 개수는 실제 텍스트 버튼을 기준으로 둔다.

  const actionBones = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
      {skeletonKeys(actionCount, 'act').map((key) => (
        <Bone key={key} width={40} height={14} borderRadius={4} />
      ))}
    </div>
  );

  // 줄 높이는 실제 ReservationRow와 같은 값을 유지한다.

  const line = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 };
  const line1 = { ...line, height: isWide ? 20 : 18 };
  const line2 = { ...line, height: 18 };
  const line3 = { ...line, height: 16 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'nowrap' }}>
        {/* 썸네일 — 실제 imgWrap(56x56)/imgWrapWide(72x72)와 동일하게 반응형 */}
        <Bone width={isWide ? 72 : 56} height={isWide ? 72 : 56} borderRadius={radius.lg ?? 8} />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* 줄1 — 가게명 | 상태 라벨 */}
          <div style={line1}>
            <Bone width={isWide ? '35%' : '45%'} height={isWide ? 17 : 15} />
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <Bone width={52} height={15} />
            </div>
          </div>

          {/* 줄2 — 예약번호(손님·사업자 모두 표시) | 금액 */}
          <div style={line2}>
            <Bone width={isWide ? 120 : '50%'} height={13} />
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <Bone width={64} height={15} />
            </div>
          </div>

          {/*
           * 날짜·시간 영역만 줄어들게 하고 넘친 골격은 잘라 액션과 겹치지 않게 한다.
           */}
          <div style={line3}>
            <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Bone width={72} height={12} />
              <Bone width={48} height={12} />
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>{actionBones}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ReservationRowSkeletonList = ({ count, actionCount = 2 }) => {
  const isWide = useIsWideRow();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {skeletonKeys(count, 'row').map((key, i) => (
        <React.Fragment key={key}>
          <ReservationRowSkeletonItem isWide={isWide} actionCount={actionCount} />
          {i < count - 1 && (
            <div style={{ height: 1, background: colors.border.light }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

/*
 * 로딩 전에는 상태를 모르므로 사업자 예약의 승인 대기 버튼 두 개를 기준으로 공간을 예약한다.
 */
const ReservationCardSkeleton = ({ count = 5 }) => <ReservationRowSkeletonList count={count} actionCount={2} />;

/** MyReservations.jsx(고객 내 예약) 로딩용 — 액션 버튼은 변경/QR/취소 3개. */
const MyReservationCardSkeleton = ({ count = 4 }) => <ReservationRowSkeletonList count={count} actionCount={3} />;

/** 카드형 예약 목록 로딩용 — 실제 카드의 커버·본문 높이를 먼저 확보한다. */
const ReservationSummaryCardSkeleton = ({ count = 4 }) => (
  <div className="reserve-reservation-card-grid">
    {skeletonKeys(count, 'reservation-card').map((key) => (
      <div key={key} className="reserve-reservation-card-skeleton" aria-hidden="true">
        <div className="reserve-reservation-card-skeleton-cover" />
        <div className="reserve-reservation-card-skeleton-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Bone width="48%" height={18} />
            <Bone width={56} height={16} />
          </div>
          <Bone width="55%" height={13} />
          <Bone width="72%" height={13} />
          <Bone width="32%" height={13} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <Bone width={64} height={13} />
            <Bone width={72} height={16} />
          </div>
        </div>
      </div>
    ))}
  </div>
);

ReservationCardSkeleton.propTypes = {
  count: PropTypes.number,
};

MyReservationCardSkeleton.propTypes = {
  count: PropTypes.number,
};

ReservationSummaryCardSkeleton.propTypes = {
  count: PropTypes.number,
};

export {
  Bone,
  StoreCardSkeleton,
  ReservationCardSkeleton,
  ReservationSummaryCardSkeleton,
  MyReservationCardSkeleton,
  ReviewCardSkeleton,
  StoreDetailSkeleton,
};
