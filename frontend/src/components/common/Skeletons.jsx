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
import { colors, radius, shadows, field, fieldPx } from '../../styles/tokens';
import Bone from './Bone';
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

/* ─────────────────────────────────────────────
   ReviewCardSkeleton
   2026-07 수정 — isPC prop 추가. PC에서는 리뷰 섹션이 풀와이드 2열 그리드로 바뀌어서
   (StoreDetail.jsx/ReviewList.jsx 참고) 스켈레톤도 같은 그리드로 맞춘다. 모바일은 기존과 동일한 1열 스택.
───────────────────────────────────────────── */
const reviewCardBoxStyle = {
  padding: '20px 16px',
  backgroundColor: colors.background.paper,
  borderRadius: 16,
  border: `1px solid ${colors.border.light}`,
  boxShadow: shadows.card,
  overflow: 'hidden',
};

const ReviewCardSkeletonItem = () => (
  <div style={reviewCardBoxStyle}>
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

    <div style={{ height: 1, backgroundColor: colors.border.light, margin: '14px 0' }} />

    {/* 본문: 제목 + 내용 (실제 reviewBody의 gap 6과 동일) */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Bone width="55%" height={14} />
      <Bone width="90%" height={13} />
      <Bone width="70%" height={13} />
    </div>

    {/* 2026-07 수정 — 수정/삭제 액션바를 그리지 않는다.
        실제 카드의 액션바는 {isOwner && ...} — 내가 쓴 리뷰에만 나온다(ReviewList.jsx).
        그런데 스켈레톤은 데이터가 오기 전에 그려지므로 "이 리뷰가 내 건지"를 알 방법이 없다.
        예전엔 무조건 그렸기 때문에 남의 리뷰만 있는 가게에선 로딩이 끝나는 순간
        카드 높이가 액션바만큼 뚝 줄어들었다. 안 그리는 쪽이 맞다 —
        없던 게 생기는 건 자연스럽지만, 있던 게 사라지는 건 어색하니까. */}
  </div>
);

const ReviewCardSkeleton = ({ count = 3, isPC = false }) => (
  <div
    style={
      isPC
        ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }
        : { display: 'flex', flexDirection: 'column', gap: 12 }
    }
  >
    {skeletonKeys(count, 'rev').map((key) => <ReviewCardSkeletonItem key={key} />)}
  </div>
);

/* ─────────────────────────────────────────────
   StoreDetailSkeleton — PC/모바일 반응형
───────────────────────────────────────────── */
const DETAIL_BREAKPOINT = 900;

/**
 * @param mapHeight KakaoMap 에 넘기는 height 와 **같은 값**이어야 한다.
 *   StoreDetail 은 PC 220 / 모바일 200 으로 다르게 넘긴다 — 한쪽만 고치면
 *   로딩 전후로 아래 내용이 그 차이만큼 밀린다.
 */
const InfoRowsSkeleton = ({ mapHeight = 220 }) => (
  <>
    {/* 폭 값이 서로 모두 달라서 값 자체가 안정적인 key가 된다(배열 인덱스 key 회피) */}
    {[80, 60, 90, 72, 68].map((w) => (
      <div key={w} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 0',
        borderBottom: `1px solid ${colors.border.light}`,
      }}>
        <Bone width={14} height={14} borderRadius={2} style={{ flexShrink: 0 }} />
        <Bone width={72} height={13} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Bone width={`${w}%`} height={13} />
        </div>
      </div>
    ))}
    {/* 지도 자리 — 2026-08-06 추가.
        KakaoMap 컴포넌트 안에는 이미 자체 Bone 이 있지만(지도 로딩 중 오버레이),
        그건 **가게 데이터를 받은 뒤** 지도가 뜨기까지의 구간만 덮는다.
        페이지 스켈레톤 단계에서는 KakaoMap 이 아직 렌더되지도 않아 그 자리가 통째로 비어 있었고,
        로딩이 끝나는 순간 지도 블록이 튀어나와 아래 내용이 밀렸다.
        높이는 호출부가 KakaoMap 에 넘기는 값과 같아야 한다 — 한쪽만 바꾸면 다시 튄다. */}
    <div style={{ marginTop: 20 }}>
      <Bone height={mapHeight} borderRadius={12} />
    </div>
  </>
);

// 실제 폼 라벨과 동일한 스타일 — AntD Form.Item vertical 라벨(기본 14px)에 맞춤
const staticLabelStyle = {
  display: 'block',
  marginBottom: 8,
  fontSize: 14,
  color: colors.text.primary,
};

const FormFieldsSkeleton = () => (
  // 2026-07 전수조사: 라벨("예약 날짜" 등)과 입력값은 성격이 완전히 다르다 — 라벨은 서버 데이터가
  // 아니라 컴포넌트에 하드코딩된 고정 텍스트라 "로딩 중"이라는 개념 자체가 없다. 실제 텍스트를
  // 그대로 노출한다. 반대로 입력 필드/버튼은 아직 상호작용할 수 없는 "준비 중" 영역이라 Bone 유지.
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    {['예약 날짜', '예약 시간', '인원 수'].map((label) => (
      <div key={label} style={{ marginBottom: 24 }}>
        <span style={staticLabelStyle}>{label}</span>
        <Bone height={fieldPx(field.height)} borderRadius={fieldPx(field.radius)} />
      </div>
    ))}
    {/* 요청 사항 — FormTextArea rows=3 */}
    <div style={{ marginBottom: 24 }}>
      <span style={staticLabelStyle}>요청 사항</span>
      <Bone height={94} borderRadius={fieldPx(field.radius)} />
    </div>
    {/* 예약 신청하기 버튼 — Button variant="primary" size="lg" */}
    <Bone height={56} borderRadius={16} style={{ marginTop: 4 }} />
  </div>
);

const StoreDetailSkeleton = ({ imageHint, isPC: isPCProp }) => {
  const [isPCState, setIsPCState] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth >= DETAIL_BREAKPOINT : false
  );
  React.useEffect(() => {
    const h = () => setIsPCState(window.innerWidth >= DETAIL_BREAKPOINT);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const isPC = isPCProp ?? isPCState;

  // imageHint(가게 목록 캐시에서 찾은 실제 이미지 원본 비율)가 있으면 커버 이미지 자리를
  // 그 비율 그대로 그려서 실제 이미지 도착 후 레이아웃이 안 튀게 함. 힌트가 없는 콜드스타트
  // (URL 직접 진입/새로고침)에서는 비율을 알 방법이 원초적으로 없어 1:1로 폴백한다.
  const coverStyle = {
    height: 'auto',
    aspectRatio: imageHint ? `${imageHint.width} / ${imageHint.height}` : '1 / 1',
  };

  // 실제 StoreDetail.jsx의 PC 레이아웃과 1:1로 맞춰야 로딩이 끝나는 순간 좌우 폭이 재조정되며 화면이 튀지 않는다.
  //   StoreDetail.jsx: pcGrid  { display:'flex', gap: 36, alignItems:'flex-start' }
  //                    pcLeft  { flex: '0 0 50%', minWidth: 0, maxWidth: 560 }
  //                    pcRight { flex: 1, minWidth: 320, maxWidth: 440, position:'sticky', top: 80 }
  //                    pcImageWrapper / formCard → borderRadius: radius.xl (16px)
  // 2026-07: 예전엔 54% / 620 / 300 / 420 + borderRadius 12라 실제값과 어긋나 있었다 — 실측해서 맞춤.
  // (sticky는 스켈레톤엔 불필요 — 스크롤 전에 사라지는 요소이고 레이아웃 폭에도 영향을 주지 않는다)
  //
  // 2026-07 추가 수정 — 리뷰를 pcGrid 밖 풀와이드 섹션으로 뺀 실제 레이아웃 변경에 맞춰,
  // 여기 스켈레톤도 리뷰 미리보기를 pcLeft(560px 제한) 밖으로 빼고 ReviewCardSkeleton(2열)을
  // 그대로 재사용한다. 예전엔 이 파일이 리뷰 이동에 안 맞춰져서, 로딩이 끝나는 순간 리뷰 영역이
  // 좁은 pcLeft 칸에서 갑자기 풀와이드로 튀는 불일치가 있었다.
  if (isPC) return (
    <div>
      {/* "뒤로가기"는 store 데이터와 무관한 정적 요소라 StoreDetail.jsx가 직접 렌더함 */}
      <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
        {/* 왼쪽 */}
        <div style={{ flex: '0 0 50%', minWidth: 0, maxWidth: 560 }}>
          {/* 커버 이미지 — 실제 pcImageWrapper의 borderRadius: radius.xl(16px) */}
          <Bone height="auto" borderRadius={16} style={{ marginBottom: 20, ...coverStyle }} />
          <Bone width="50%" height={28} style={{ marginBottom: 20 }} />
          <InfoRowsSkeleton mapHeight={220} />
        </div>
        {/* 오른쪽: 예약폼 — StoreDetail.jsx의 pcRight + formCard와 동일한 폭/모서리 */}
        <div style={{
          flex: 1, minWidth: 320, maxWidth: 440,
          padding: '28px 24px', borderRadius: 16,
          border: `1px solid ${colors.border.light}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          {/* "예약하기" — 가게와 무관한 고정 제목이라 스켈레톤으로 가리지 않고 실제 텍스트 노출 */}
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.text.primary, marginBottom: 20 }}>
            예약하기
          </div>
          <FormFieldsSkeleton />
        </div>
      </div>
      {/* 리뷰 — pcGrid 밖 풀와이드 섹션 (실제 StoreDetail.jsx와 동일한 위치/폭) */}
      <Bone height={1} borderRadius={0} style={{ margin: '24px 0' }} />
      <Bone width="15%" height={20} style={{ marginBottom: 16 }} />
      <ReviewCardSkeleton count={4} isPC />
    </div>
  );

  // 모바일 — 실제 mobileImageWrapper는 { width:'100%', borderRadius: radius.xl(16) }로,
  // 화면 끝까지 붙는 full-bleed가 아니다. 예전 스켈레톤은 margin '0 -16px' + radius 0으로
  // 좌우를 꽉 채웠다가 로딩이 끝나면 안쪽으로 튀어들어오며 둥근 모서리로 바뀌었다 — 실제와 동일하게 수정.
  return (
    <div>
      <Bone height="auto" borderRadius={16} style={{ width: '100%', ...coverStyle }} />
      <Bone width="55%" height={28} style={{ marginTop: 20, marginBottom: 16 }} />
      <InfoRowsSkeleton mapHeight={200} />
      <Bone height={1} borderRadius={0} style={{ margin: '20px 0' }} />
      <div style={{ fontSize: 22, fontWeight: 800, color: colors.text.primary, marginBottom: 20 }}>
        예약하기
      </div>
      <FormFieldsSkeleton />
    </div>
  );
};


ReservationCardSkeleton.propTypes = {
  count: PropTypes.number,
};

MyReservationCardSkeleton.propTypes = {
  count: PropTypes.number,
};

ReservationSummaryCardSkeleton.propTypes = {
  count: PropTypes.number,
};

ReviewCardSkeleton.propTypes = {
  count: PropTypes.number,
  isPC: PropTypes.bool,
};


StoreDetailSkeleton.propTypes = {
  imageHint: PropTypes.shape({ width: PropTypes.number, height: PropTypes.number }),
  isPC: PropTypes.bool,
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
