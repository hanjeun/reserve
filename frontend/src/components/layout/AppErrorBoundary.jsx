import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import * as Sentry from '@sentry/react';
import { useLocation, useNavigate } from 'react-router-dom';
// Filled 아이콘은 이미 첫 번들에 있다(메시지 토스트). Outlined 를 새로 넣으면 번들 예산을 넘는다.
import { ExclamationCircleFilled } from '../common/icons';
import Button from '../common/Button';
import PageStatus from '../common/PageStatus';
import { isChunkLoadError } from '../../utils/chunkReload';

/*
 * 라우트 오류는 콘텐츠에 한정해 셸을 유지하고 앱 셸 오류는 바깥 경계에서 처리한다. React.lazy의 청크 오류는 새로고침으로 복구한다.
 */
function ErrorFallback({ error, resetError, goHome, fullPage = false }) {
    const chunkError = isChunkLoadError(error);
    return (
        <PageStatus
            role="alert"
            className={`reserve-error-fallback${fullPage ? ' reserve-error-fallback--app' : ''}`}
            icon={<ExclamationCircleFilled />}
            illustration={chunkError ? 'retry' : 'unknown-error'}
            title={chunkError ? '화면을 불러오지 못했어요' : '문제가 생겼어요'}
            description={chunkError
                ? '새 버전이 배포됐거나 연결이 잠시 불안정했어요. 새로고침하면 대부분 해결돼요.'
                : '일시적인 오류로 화면을 표시하지 못했어요. 다시 시도하거나 잠시 후 새로고침해 주세요.'}
            actions={<>
                {chunkError
                    ? <Button variant="primary" size="md" onClick={() => window.location.reload()}>새로고침</Button>
                    : <Button variant="primary" size="md" onClick={resetError}>다시 시도</Button>}
                <Button variant="secondary" size="md" onClick={goHome}>홈으로</Button>
            </>}
        />
    );
}

function RouteErrorFallback({ error, resetError }) {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    // 오류가 난 주소를 기억해 두고, 헤더·뒤로가기 등으로 주소가 바뀌면 경계를 풀어 새 화면을 그린다.
    // 경계에 key={pathname} 을 주면 같은 라우트 안의 이동(/store/1 → /store/2)까지 매번 페이지를
    // 새로 마운트하게 되므로, 오류가 난 동안에만 주소를 지켜본다.
    const [errorPathname] = useState(pathname);
    useEffect(() => {
        if (pathname !== errorPathname) resetError();
    }, [pathname, errorPathname, resetError]);

    const goHome = () => {
        navigate('/');
        resetError();
    };
    return <ErrorFallback error={error} resetError={resetError} goHome={goHome} />;
}

// 셸이 무너진 상태라 라우터·스토어에 기대지 않는다. 홈으로는 문서를 새로 불러온다.
const AppErrorFallback = ({ error, resetError }) => (
    <ErrorFallback error={error} resetError={resetError} goHome={() => window.location.assign('/')} fullPage />
);

const tagBoundary = (name) => (scope) => { scope.setTag('error_boundary', name); };

export function RouteErrorBoundary({ children }) {
    return <Sentry.ErrorBoundary beforeCapture={tagBoundary('route')} fallback={RouteErrorFallback}>{children}</Sentry.ErrorBoundary>;
}
RouteErrorBoundary.propTypes = { children: PropTypes.node };

export function AppErrorBoundary({ children }) {
    return <Sentry.ErrorBoundary beforeCapture={tagBoundary('app')} fallback={AppErrorFallback}>{children}</Sentry.ErrorBoundary>;
}
AppErrorBoundary.propTypes = { children: PropTypes.node };
