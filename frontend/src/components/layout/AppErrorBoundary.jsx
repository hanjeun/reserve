import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import * as Sentry from '@sentry/react';
import { useLocation, useNavigate } from 'react-router-dom';
// Filled 아이콘은 이미 첫 번들에 있다(메시지 토스트). Outlined 를 새로 넣으면 번들 예산을 넘는다.
import { ExclamationCircleFilled } from '@ant-design/icons';
import Button from '../common/Button';
import PageStatus from '../common/PageStatus';
import { isChunkLoadError } from '../../utils/chunkReload';

/**
 * 렌더 오류 경계 두 겹.
 *
 * 예전엔 경계가 없어서 한 페이지의 렌더 오류가 앱 전체를 흰 화면으로 만들었다.
 *   - RouteErrorBoundary: 라우트 콘텐츠만 감싼다(Layout 안). 헤더·푸터는 살아 있어서 다른 곳으로 갈 수 있다.
 *   - AppErrorBoundary: AntApp 바깥, 앱 셸(헤더·메신저·레이아웃) 자체가 실패했을 때의 마지막 그물.
 * 둘 다 Sentry.ErrorBoundary 라서 잡은 오류는 Sentry 로 보고된다(main.jsx 의 Sentry.init).
 *
 * 청크 로딩 실패는 "다시 시도"로 복구되지 않는다 — React.lazy 가 실패한 import 를 기억하기 때문이다.
 * 그 경우에는 새로고침을 첫 버튼으로 내세운다(자동 1회 새로고침은 utils/chunkReload.js).
 *
 * 이 파일은 첫 번들(index 청크)에 들어간다 — 번들 예산(scripts/check-bundle-budget.mjs)이 빠듯해서
 * 폴백은 컴포넌트 하나로 가볍게 두고, 파일 안에서만 쓰는 폴백에는 propTypes 를 달지 않는다
 * (Sentry.ErrorBoundary 가 항상 같은 모양의 props 를 넘긴다).
 */
function ErrorFallback({ error, resetError, goHome }) {
    const chunkError = isChunkLoadError(error);
    return (
        <PageStatus
            role="alert"
            icon={<ExclamationCircleFilled />}
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
    <ErrorFallback error={error} resetError={resetError} goHome={() => window.location.assign('/')} />
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
