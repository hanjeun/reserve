import { httpStatusOf, listRequestErrorMessage } from '../../utils/listErrorMessage';

const POLL_LIST_MS = 30000;

export const shouldRetryChatList = (failureCount, error) => {
    const status = httpStatusOf(error);
    // 경로·권한·요청 오류는 자동 재시도로 반복하지 않는다.
    // 일시적 연결 단절·429·5xx만 한 번 재시도한다.
    return failureCount < 1 && !(status >= 400 && status < 500 && status !== 429);
};

/* 서버 내부 문구 대신 사용자가 구분할 수 있는 오류 범위만 안내한다. */
export const chatListErrorMessage = (error, subject = '대화 목록') =>
    listRequestErrorMessage(error, subject);

export const shouldAutoRefreshChatMetadata = query => {
    const error = query.state.error;
    const status = httpStatusOf(error);
    return !(status >= 400 && status < 500 && status !== 429);
};

// 경로·권한 오류는 반복 요청하지 않고 조회 오류로 표시한다.
// 대화 목록은 재진입·포커스 복귀 때 최신 배지를 조회한다.
// 일시적 연결 오류는 기존 주기·포커스·재연결에서 복구를 시도한다.
export const chatListQueryPolicy = {
    staleTime: 0,
    retry: shouldRetryChatList,
    refetchInterval: query => shouldAutoRefreshChatMetadata(query) ? POLL_LIST_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: shouldAutoRefreshChatMetadata,
    refetchOnReconnect: shouldAutoRefreshChatMetadata,
};
