export const httpStatusOf = error => {
    const status = Number(error?.status ?? error?.response?.status);
    return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
};

const errorMessage = error => typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : '';
const timedOut = error => ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code) || errorMessage(error).includes('응답이 너무 늦');
const disconnected = error => error?.code === 'ERR_NETWORK'
    || ['Network Error', 'Failed to fetch', 'fetch failed'].includes(errorMessage(error))
    || errorMessage(error).includes('서버에 연결할 수 없');

export const isMissingRequestError = error => [404, 410].includes(httpStatusOf(error));

/* 오류 표면에서 상태에 맞는 아이콘을 선택하는 의미 값이다. */
export const listRequestErrorKind = error => {
    const status = httpStatusOf(error);
    if (status === 401 || status === 403) return 'forbidden';
    if (isMissingRequestError(error)) return 'missing';
    if (status === 408 || status === 429) return 'rateLimited';
    if (status === 409) return 'retry';
    if (status >= 500) return 'unavailable';
    if (!status && globalThis.navigator?.onLine === false) return 'offline';
    if (timedOut(error) || disconnected(error)) return 'unavailable';
    return 'unknown';
};

const withObjectParticle = subject => {
    const last = subject.at(-1);
    const code = last?.codePointAt(0);
    const hasFinalConsonant = code >= 0xac00 && code <= 0xd7a3
        ? (code - 0xac00) % 28 !== 0
        : false;
    return `${subject}${hasFinalConsonant ? '을' : '를'}`;
};

/*
 * 빈 목록·항목 부재·조회 오류를 구분하고 서버 내부 메시지는 직접 노출하지 않는다.
 */
export const listRequestErrorMessage = (error, subject = '목록', requestType = 'list') => {
    const status = httpStatusOf(error);
    const object = withObjectParticle(subject);
    if (status === 400 || status === 422) return `${subject} 요청을 처리할 수 없어요. 화면을 새로고침한 뒤 다시 시도해주세요.`;
    if (status === 401) return `${object} 보려면 다시 로그인해주세요.`;
    if (status === 403) return `${object} 볼 권한이 없어요. 로그인한 계정을 확인해주세요.`;
    if (requestType === 'detail' && status === 404) return `요청하신 ${object} 찾을 수 없어요.`;
    if (requestType === 'detail' && status === 410) return `요청하신 ${object} 더 이상 볼 수 없어요.`;
    if (status === 404 || status === 410) return `요청한 ${object} 불러올 수 없어요. 잠시 후 다시 시도해주세요.`;
    if (status === 408) return `${subject} 요청 시간이 초과됐어요. 잠시 후 다시 시도해주세요.`;
    if (status === 409) return `${subject} 상태가 바뀌었어요. 새로고침한 뒤 다시 확인해주세요.`;
    if (status === 429) return `요청이 잠시 제한됐어요. 잠시 후 ${object} 다시 불러와주세요.`;
    if (status >= 500) return `서버에서 ${object} 처리하지 못했어요. 잠시 후 다시 시도해주세요.`;
    if (globalThis.navigator?.onLine === false) return `인터넷 연결이 끊겨 ${object} 불러오지 못했어요.`;
    if (timedOut(error)) return `${subject} 응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.`;
    if (disconnected(error)) return `서버에 연결할 수 없어 ${object} 불러오지 못했어요.`;
    return `${object} 불러오지 못했어요. 잠시 후 다시 시도해주세요.`;
};

/* 화면의 제목을 유지할 때도 확인된 실패 원인을 안전한 문구로 전달한다. */
export const listRequestErrorDescription = (error, requestType = 'list') => {
    const status = httpStatusOf(error);
    if (status === 400 || status === 422) return '요청을 처리할 수 없어요. 화면을 새로고침한 뒤 다시 시도해주세요.';
    if (status === 401) return '다시 로그인한 뒤 이용해주세요.';
    if (status === 403) return '조회 권한이 없어요. 로그인한 계정을 확인해주세요.';
    if (status === 404 || status === 410) return requestType === 'detail'
        ? '요청한 정보를 더 이상 확인할 수 없어요.' : '요청한 정보를 불러올 수 없어요. 잠시 후 다시 시도해주세요.';
    if (status === 408 || !status && timedOut(error)) return '서버 응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.';
    if (status === 409) return '정보의 상태가 바뀌었어요. 다시 불러와주세요.';
    if (status === 429) return '요청이 잠시 제한됐어요. 잠시 후 다시 시도해주세요.';
    if (status >= 500) return '서버에서 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
    if (!status && globalThis.navigator?.onLine === false) return '인터넷 연결이 끊겼어요. 연결 상태를 확인해주세요.';
    if (!status && disconnected(error)) return '서버에 연결할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해주세요.';
    return undefined;
};
