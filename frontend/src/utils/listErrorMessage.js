export const httpStatusOf = error => error?.status ?? error?.response?.status;

export const isMissingRequestError = error => [404, 410].includes(httpStatusOf(error));

/** 조회 실패 표면이 상태별 Ant Design 아이콘을 고를 때 쓰는 의미 값이다. */
export const listRequestErrorKind = error => {
    const status = httpStatusOf(error);
    if (globalThis.navigator?.onLine === false) return 'offline';
    if (status === 401 || status === 403) return 'forbidden';
    if (isMissingRequestError(error)) return 'missing';
    if (status === 408 || status === 429) return 'rateLimited';
    if (status === 409) return 'retry';
    if (status >= 500 || error?.message?.includes('서버에 연결할 수 없') || error?.message?.includes('응답이 너무 늦')) return 'unavailable';
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

/**
 * 빈 목록과 실제 조회 실패를 구분하고, 상세 조회는 요청한 항목의 부재를 안내한다.
 * 서버 내부 메시지는 화면에 그대로 노출하지 않는다.
 */
export const listRequestErrorMessage = (error, subject = '목록', requestType = 'list') => {
    const status = httpStatusOf(error);
    const object = withObjectParticle(subject);
    if (status === 400 || status === 422) return `${subject} 요청을 처리할 수 없습니다. 화면을 새로고침한 뒤 다시 시도해주세요.`;
    if (status === 401) return `${object} 보려면 다시 로그인해주세요.`;
    if (status === 403) return `${object} 볼 권한이 없습니다. 로그인한 계정을 확인해주세요.`;
    if (requestType === 'detail' && status === 404) return `요청하신 ${object} 찾을 수 없습니다.`;
    if (requestType === 'detail' && status === 410) return `요청하신 ${object} 더 이상 볼 수 없습니다.`;
    if (status === 404 || status === 410) return `요청한 ${object} 불러올 수 없습니다. 잠시 후 다시 시도해주세요.`;
    if (status === 408) return `${subject} 요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.`;
    if (status === 409) return `${subject} 상태가 바뀌었습니다. 새로고침한 뒤 다시 확인해주세요.`;
    if (status === 429) return `요청이 잠시 제한되었습니다. 잠시 후 ${object} 다시 불러와주세요.`;
    if (status >= 500) return `서버에서 ${object} 처리하지 못했습니다. 잠시 후 다시 시도해주세요.`;
    if (globalThis.navigator?.onLine === false) return `인터넷 연결이 끊겨 ${object} 불러오지 못했습니다.`;
    if (error?.message?.includes('응답이 너무 늦')) return `${subject} 응답이 늦어지고 있습니다. 잠시 후 다시 시도해주세요.`;
    if (error?.message?.includes('서버에 연결할 수 없')) return `서버에 연결할 수 없어 ${object} 불러오지 못했습니다.`;
    return `${object} 불러오지 못했습니다. 잠시 후 다시 시도해주세요.`;
};
