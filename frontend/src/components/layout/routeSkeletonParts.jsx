import PropTypes from 'prop-types';
import { Typography } from 'antd';
import Bone from '../common/Bone';
import { fontSize, fontWeight } from '../../styles/tokens';

// 목록형 청크 로딩 뼈대가 함께 쓰는 제목·도구줄 조각. 앱 셸 청크에 들어가는 가벼운 부품만 둔다
// (페이지별 큰 뼈대는 RouteSkeletonPages — 별도 청크).
const { Title, Text } = Typography;

export function ListingHeader({ title, description, marginBottom = 32, descriptionSize = fontSize.lg }) {
    return <div style={{ marginBottom }}>
        <Title level={2} style={{ margin: '0 0 8px', fontWeight: fontWeight.extrabold }}>{title}</Title>
        <Text type="secondary" style={{ fontSize: descriptionSize }}>{description}</Text>
    </div>;
}
ListingHeader.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string.isRequired, marginBottom: PropTypes.number, descriptionSize: PropTypes.string };

export function ListingToolbarSkeleton() {
    // 실제 줄은 보기 전환·필터 버튼이 44px 터치 영역이라 44 + 아래 8 + 구분선 1 = 53px 이다.
    // 뼈대만 두면 36px 로 줄어 로딩이 끝날 때 아래 내용이 8px 밀렸다(2026-09-29 실측).
    return <div className="reserve-explore-filters" aria-hidden="true" style={{ minHeight: 44, boxSizing: 'content-box' }}>
        <Bone width={72} height={36} />
        <span style={{ flex: 1 }} />
        <div className="reserve-explore-filter-controls"><Bone width={82} height={36} /><Bone width={90} height={36} /></div>
    </div>;
}

export function RefreshToolbarSkeleton({ search = false }) {
    // 실제 FilterToolbar 와 같은 배치: 검색칸은 남는 폭을 채우되 줄어들 수 있고(최대 480px),
    // 새로고침은 같은 .reserve-filter-toolbar-refresh 자리에 글자 버튼 크기(약 70x18)로 둔다.
    // Bone 은 기본이 flexShrink 0 이라 100% 폭 검색 뼈대가 줄지 않아 새로고침이 화면 밖(390 폭에서 x=406)으로 밀렸다.
    return <div className="reserve-filter-toolbar" aria-hidden="true">
        <div className={`reserve-filter-toolbar-secondary${search ? '' : ' reserve-filter-toolbar-secondary--refresh-only'}`}>
            {search && <Bone height={40} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, maxWidth: 480 }} />}
            <div className="reserve-filter-toolbar-refresh"><Bone width={70} height={16} /></div>
        </div>
    </div>;
}
RefreshToolbarSkeleton.propTypes = { search: PropTypes.bool };

