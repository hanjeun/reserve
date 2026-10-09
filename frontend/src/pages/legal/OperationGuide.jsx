import { Navigate, useLocation } from 'react-router-dom';
import { DEFAULT_GUIDE_PATH } from './GuidePageMetadata';

// 기존 홈·푸터·외부 링크는 공통 이용안내로 이어진다.
export default function OperationGuide() {
    const { search, hash } = useLocation();
    return <Navigate to={{ pathname: DEFAULT_GUIDE_PATH, search, hash }} replace />;
}
