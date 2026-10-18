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
 *
 * 2026-07-09 전체 재검수: 실제 컴포넌트와 다시 대조해서 고침 —
 * 1) ReservationCardSkeleton / MyReservationCardSkeleton: ReservationCard.jsx와
 *    MyReservations.jsx가 예전엔 서로 다른 레이아웃이었는데, 지금은 둘 다 완전히 동일한
 *    "가로 한 줄 + 구분선" 구조(row/imgWrap/info/right)를 씀 — 하나의 반응형(isWide) 아이템으로
 *    통합해서 둘 다 이걸 재사용하게 함.
 * 2) StoreCardSkeleton / ReviewCardSkeleton: 실제 Card boxShadow(shadows.card)가 스켈레톤엔 없었음 — 추가.
 * 3) FavoriteCardSkeleton: 실제로 어디서도 안 쓰이는 죽은 코드였음 — 제거.
 *
 * 2026-07 추가 전수조사 — 리뷰 섹션을 StoreDetail.jsx의 2단 레이아웃(pcGrid) 밖으로 빼서
 * 풀와이드 2열 그리드로 바꾼 것에 맞춰:
 * 4) ReviewCardSkeleton에 isPC prop 추가 — PC에서는 2열 그리드, 모바일은 기존처럼 1열 스택.
 * 5) StoreDetailSkeleton의 PC 분기 — 예전엔 리뷰 미리보기가 여전히 pcLeft(560px 폭 제한) 안에
 *    하드코딩되어 있었다. 실제 레이아웃은 이미 리뷰를 pcGrid 밖 풀와이드로 뺐는데 스켈레톤만
 *    안 따라와서, 로딩이 끝나는 순간 리뷰 영역이 좁은 칸에서 넓은 풀와이드로 튀는 불일치가 있었다 —
 *    pcGrid와 동일하게 리뷰 블록을 밖으로 빼고, 하드코딩 대신 ReviewCardSkeleton을 그대로 재사용.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { colors, radius } from '../../styles/tokens';
import Bone from './Bone';
import StoreDetailSkeleton, { ReviewCardSkeleton } from './StoreDetailSkeleton';
import StoreCardSkeleton from './StoreCardSkeleton';

/* ─────────────────────────────────────────────
   기본 블록 (shimmer 적용된 div)

   ★ 2026-08-04 — shimmer CSS 는 이 파일에 없다. `index.css` 의 "스켈레톤 shimmer" 블록에 있다.
     예전에는 이 파일이 런타임에 <style> 을 document.head 에 주입했다. 그 방식의 문제:
       1) 전역 규칙이 컴포넌트 파일에 숨어 있어, 이 파일을 import 하지 않는 화면에는 규칙이 없다
          (이 프로젝트가 같은 함정에 두 번 빠졌다 — docs/technical/design-system.md 참고)
       2) head 맨 뒤에 붙어서 index.css 규칙을 덮어버린다 — 두 곳에 두면 반드시 충돌한다
     → 규칙은 index.css 한 곳에만 둔다. 여기서는 클래스명만 붙인다.
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   스켈레톤용 안정적 key 생성
   스켈레톤은 순서가 바뀌거나 항목이 추가/삭제되지 않는 정적 목록이라 인덱스를 key로 써도
   실제 버그는 없지만, 배열 인덱스 key 규칙(SonarCloud/react)을 지키면서 의도를 분명히 하려고
   문자열 key를 미리 만들어 쓴다 (MailboxTab의 스켈레톤과 동일한 컨벤션).
───────────────────────────────────────────── */
const skeletonKeys = (n, prefix = 'sk') => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

/* ─────────────────────────────────────────────
   예약 목록 행 스켈레톤 (공용) — ReservationCard.jsx(사업자)와 MyReservations.jsx(고객)가
   지금 완전히 동일한 "가로 한 줄 + 구분선" 구조를 쓰기 때문에 스켈레톤도 하나로 통합.
───────────────────────────────────────────── */
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

// 2026-07-30 ReservationRow 3줄 독립 정렬 구조 반영.
// 실제 카드는 [썸네일] + 3줄 스택이고, 각 줄이 자기 안에서 좌우로 나뉜다:
//   줄1 가게명 | 상태 / 줄2 예약번호 | 금액 / 줄3 날짜·시간 | 액션 버튼
// 예전 스켈레톤은 오른쪽 컬럼(상태→가격→버튼)을 하나로 묶어 그렸는데, 실제 카드가 바뀌면서
// 로딩이 끝나는 순간 요소들이 자리를 옮겨 앉는 문제가 생겼다 — 같은 3줄 구조로 맞춘다.
const ReservationRowSkeletonItem = ({ isWide, actionCount = 2 }) => {
  // 액션 버튼 Bone — 실제 버튼은 텍스트형(ghost)이라 얇다(실측 약 40x15, fontSize 13, padding 0).
  // 손님은 3개(변경/QR/취소), 사업자는 2개(승인/거절) — 실제와 개수를 맞춰야 폭이 안 튄다.
  // 미결제 예약은 결제하기까지 4개지만, 로딩 시점엔 알 수 없어 다수 케이스에 맞춘다.
  const actionBones = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
      {skeletonKeys(actionCount, 'act').map((key) => (
        <Bone key={key} width={40} height={14} borderRadius={4} />
      ))}
    </div>
  );

  // 줄 높이 = Bone 높이. 실제 카드(ReservationRow)가 이 값에 맞춰 line-height를 고정한다.
  // 반대로 스켈레톤을 텍스트 line-height(1.5714)에 맞추면 카드가 113.6px로 커지는데,
  // 썸네일(56px)보다 한참 크고 정보량 대비 헐렁해 보여서 촘촘한 쪽(92px)을 기준으로 삼았다.
  // ReservationRow.jsx의 line1/line2/line3와 같은 값을 유지할 것 (한쪽만 바꾸면 로딩 전후로 카드가 튄다).
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

          {/* 줄3 — 날짜·시간 | 액션 버튼. 실제 카드에서 폭이 모자라면 줄어드는 건 이 줄의 왼쪽뿐이다.
              왼쪽 뼈대는 크기가 고정(flexShrink 0)이라 묶음이 줄어도 넘쳐 버튼 뼈대와 겹쳤다(390 폭 실측) — 넘치는 부분은 잘라낸다. */}
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

/** ReservationCard.jsx(사업자 예약 관리 탭) 로딩용 — 액션 버튼 2개 기준.
 *  예전에는 손님과 같은 3개로 그려서 오른쪽 폭이 로딩 후에 줄어들었다.
 *
 *  ⚠️ 2026-08-11부터 사업자 카드의 버튼 수는 상태마다 다르다 —
 *  PENDING 2개(승인·거절) / CONFIRMED 3개(완료·노쇼·취소) / 종료 상태 1개(삭제).
 *  로딩 시점에는 목록에 무엇이 올지 알 수 없으므로 하나를 고를 수밖에 없고,
 *  사업자가 가장 먼저 처리하는 PENDING(2개)에 맞춰 둔다. */
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
