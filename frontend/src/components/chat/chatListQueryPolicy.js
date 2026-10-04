import { httpStatusOf, listRequestErrorMessage } from '../../utils/listErrorMessage';

const POLL_LIST_MS = 30000;

export const shouldRetryChatList = (failureCount, error) => {
    const status = httpStatusOf(error);
    // 잘못된 경로·권한·요청은 같은 요청을 되풀이해도 복구되지 않는다.
    // 연결 단절·429·5xx만 한 번 더 확인해 순간적인 실패를 목록 전체 오류로 만들지 않는다.
    return failureCount < 1 && !(status >= 400 && status < 500 && status !== 429);
};

/** 서버 내부 문구를 그대로 노출하지 않고, 사용자가 구분할 수 있는 실패 범위만 안내한다. */
export const chatListErrorMessage = (error, subject = '대화 목록') =>
    listRequestErrorMessage(error, subject);

export const shouldAutoRefreshChatMetadata = query => {
    const error = query.state.error;
    const status = httpStatusOf(error);
    return !(status >= 400 && status < 500 && status !== 429);
};

// 조회 실패는 그대로 표시한다. 경로/권한 오류를 반복 요청해도 복구되지 않는다.
// 전역 3분 캐시는 대화 목록에 적용하지 않는다. 다시 열기·포커스 복귀 때 바로 최신 배지를 읽는다.
// 네트워크·서버 장애는 기존 30초 갱신과 포커스/재연결에서 복구를 시도한다.
export const chatListQueryPolicy = {
    staleTime: 0,
    retry: shouldRetryChatList,
    refetchInterval: query => shouldAutoRefreshChatMetadata(query) ? POLL_LIST_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: shouldAutoRefreshChatMetadata,
    refetchOnReconnect: shouldAutoRefreshChatMetadata,
};
