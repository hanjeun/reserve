import { useNavigate } from 'react-router-dom';
import { FileUnknownOutlined } from '../components/common/icons';
import { Button, PageStatus } from '../components/common';
import useDocumentTitle from '../hooks/useDocumentTitle';
import useGoBack from '../hooks/useGoBack';

/*
 * 미등록 경로를 표시한다. 색인 정책은 useRouteSeo와 nginx의 공통 경로 규칙에서 관리한다.
 */
export default function NotFound() {
    const navigate = useNavigate();
    const goBack = useGoBack('/');
    useDocumentTitle('페이지를 찾을 수 없어요');

    return (
        <PageStatus
            icon={<FileUnknownOutlined />}
            illustration="not-found"
            title="페이지를 찾을 수 없어요"
            description="주소가 잘못 입력됐거나 더 이상 제공하지 않는 페이지예요."
            actions={<>
                <Button variant="primary" size="md" onClick={() => navigate('/')}>홈으로</Button>
                <Button variant="secondary" size="md" onClick={goBack}>뒤로가기</Button>
            </>}
        />
    );
}
