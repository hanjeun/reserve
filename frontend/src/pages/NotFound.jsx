import { useNavigate } from 'react-router-dom';
import { FileUnknownOutlined } from '@ant-design/icons';
import { Button, PageStatus } from '../components/common';
import useDocumentTitle from '../hooks/useDocumentTitle';
import useGoBack from '../hooks/useGoBack';

/**
 * 어떤 라우트에도 맞지 않는 주소(App.jsx 의 path="*")가 그리는 화면.
 *
 * 예전엔 catch-all 라우트가 없어서 헤더와 푸터 사이가 통째로 비어 있었다
 * (예: 공유 과정에서 깨진 `/,%20https://reserve.it.kr/login`).
 *
 * 검색 노출: robots 메타는 useRouteSeo 가 INDEXABLE_PATHS 밖의 경로를 전부 noindex 로 두고,
 * JS 를 실행하지 않는 크롤러에는 nginx 가 같은 경로에 X-Robots-Tag: noindex 를 보낸다.
 * 이 화면에서 따로 메타를 만지지 않는 이유 — 관문이 둘로 갈리면 경로 전환 때 서로 덮어쓴다.
 */
export default function NotFound() {
    const navigate = useNavigate();
    const goBack = useGoBack('/');
    useDocumentTitle('페이지를 찾을 수 없어요');

    return (
        <PageStatus
            icon={<FileUnknownOutlined />}
            title="페이지를 찾을 수 없어요"
            description="주소가 잘못 입력됐거나 더 이상 제공하지 않는 페이지예요."
            actions={<>
                <Button variant="primary" size="md" onClick={() => navigate('/')}>홈으로</Button>
                <Button variant="secondary" size="md" onClick={goBack}>뒤로가기</Button>
            </>}
        />
    );
}
