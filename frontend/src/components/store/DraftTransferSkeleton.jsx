import Bone from '../common/Bone';
import Button from '../common/Button';
import PageContainer from '../common/PageContainer';
import { PageDescription, PageTitle } from '../common/PageTypography';
import SkeletonText from '../common/SkeletonText';
import { StateIllustrationSkeleton } from '../common/StateIllustration';
import { APP_ORIGIN, LEGACY_ORIGIN } from '../../config/siteUrls';

export default function DraftTransferSkeleton() {
    const split = APP_ORIGIN !== LEGACY_ORIGIN;
    const legacy = window.location.origin === LEGACY_ORIGIN && split;
    return <PageContainer size="md" aria-label="가게 초안을 불러오는 중" aria-busy="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <StateIllustrationSkeleton size="sm" />
            <PageTitle loading style={{ margin: 0 }}>가게 초안 옮기기</PageTitle>
        </div>
        <PageDescription loading>가게 등록·수정 중 저장한 내용과 사진을 새 앱 주소로 옮겨요.</PageDescription>
        <p className="reserve-feed-note"><SkeletonText>기존 주소에서 파일을 내보내고, 새 앱에서 같은 계정으로 로그인해 가져오세요.</SkeletonText></p>
        {legacy && <p><SkeletonText>새 앱에서 가져오기</SkeletonText></p>}
        <div className="reserve-feed-editor-actions" aria-hidden="true">
            <Button variant="outline" size="sm" disabled><SkeletonText>선택한 초안 내보내기</SkeletonText></Button>
            <Button size="sm" disabled><SkeletonText>파일 가져오기</SkeletonText></Button>
        </div>
        <ul className="reserve-feed-report-list" aria-hidden="true">
            {['first', 'second', 'third'].map(key => <li key={key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <Bone width={16} height={16} borderRadius={4} />
                    <Bone width="min(240px, 55vw)" height={16} />
                </div>
                <SkeletonText>작성 계속하기</SkeletonText>
            </li>)}
        </ul>
        {split && !legacy && <p><SkeletonText>기존 주소의 임시저장 확인</SkeletonText></p>}
    </PageContainer>;
}
