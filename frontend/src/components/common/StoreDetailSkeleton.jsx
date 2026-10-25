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

    {/*
     * 로딩 중에는 리뷰 소유자를 모르므로 수정·삭제 실행 영역을 예약하지 않는다.
     */}
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
    {/*
     * 가게 조회 전에도 실제 지도와 같은 높이를 예약한다.
     */}
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

  // 전체 사진 크기를 알면 가장 높은 슬라이드를, 일부 힌트만 있으면 첫 사진을 기준으로 예약한다.
  // 측정값이 없으면 알 수 없는 크기의 대체 골격을 사용한다.
  const coverStyle = {
    height: 'auto',
    aspectRatio: imageHint?.layoutRatio ? String(imageHint.layoutRatio)
      : imageHint ? `${imageHint.width} / ${imageHint.height}` : '1 / 1',
  };

  // PC 골격은 실제 상세의 열 너비와 리뷰 영역을 맞춘다.

  // 리뷰 골격은 실제 상세의 별도 전체 너비 영역을 따른다.

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
