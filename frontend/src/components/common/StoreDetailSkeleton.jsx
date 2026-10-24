import React from 'react';
import PropTypes from 'prop-types';
import { colors, shadows, field, fieldPx } from '../../styles/tokens';
import Bone from './Bone';
import SkeletonText from './SkeletonText';

const skeletonKeys = (count, prefix) => Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

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

/*   StoreDetailSkeleton — PC/모바일 반응형*/
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
  // 고정 라벨도 실제 문구의 크기·줄바꿈을 유지하는 뼈대로 표시한다.
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    {['예약 날짜', '예약 시간', '인원 수'].map((label) => (
      <div key={label} style={{ marginBottom: 24 }}>
        <span style={staticLabelStyle}><SkeletonText>{label}</SkeletonText></span>
        <Bone height={fieldPx(field.height)} borderRadius={fieldPx(field.radius)} />
      </div>
    ))}
    {/* 요청 사항 — FormTextArea rows=3 */}
    <div style={{ marginBottom: 24 }}>
      <span style={staticLabelStyle}><SkeletonText>요청 사항</SkeletonText></span>
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

  // Complete geometry reserves the unchanged carousel's tallest slide; partial hints describe only its first photo.
  // An unmeasured photo or a static document without a hint still needs the unknown-size fallback.
  const coverStyle = {
    height: 'auto',
    aspectRatio: imageHint?.layoutRatio ? String(imageHint.layoutRatio)
      : imageHint ? `${imageHint.width} / ${imageHint.height}` : '1 / 1',
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
          <div className="reserve-page-title ant-typography" style={{ width: '50%', margin: '0 0 20px' }}><Bone width="100%" height="1.4em" /></div>
          <InfoRowsSkeleton mapHeight={220} />
        </div>
        {/* 오른쪽: 예약폼 — StoreDetail.jsx의 pcRight + formCard와 동일한 폭/모서리 */}
        <div style={{
          flex: 1, minWidth: 320, maxWidth: 440,
          padding: '28px 24px', borderRadius: 16,
          border: `1px solid ${colors.border.light}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          {/* 실제 제목과 같은 크기의 텍스트 뼈대 */}
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.text.primary, marginBottom: 20 }}>
            <SkeletonText>예약하기</SkeletonText>
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
      <div className="reserve-page-title ant-typography" style={{ width: '55%', margin: '20px 0 16px' }}><Bone width="100%" height="1.4em" /></div>
      <InfoRowsSkeleton mapHeight={200} />
      <Bone height={1} borderRadius={0} style={{ margin: '20px 0' }} />
      <div style={{ fontSize: 22, fontWeight: 800, color: colors.text.primary, marginBottom: 20 }}>
        <SkeletonText>예약하기</SkeletonText>
      </div>
      <FormFieldsSkeleton />
    </div>
  );
};

ReviewCardSkeleton.propTypes = {
  count: PropTypes.number,
  isPC: PropTypes.bool,
};
StoreDetailSkeleton.propTypes = {
  imageHint: PropTypes.shape({ width: PropTypes.number, height: PropTypes.number, layoutRatio: PropTypes.number }),
  isPC: PropTypes.bool,
};

export { ReviewCardSkeleton };
export default StoreDetailSkeleton;
