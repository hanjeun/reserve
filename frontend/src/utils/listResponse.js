/** 200/204의 빈 목록과 Spring Page 응답을 같은 목록 계약으로 정규화한다. */
export const normalizeListPage = (value, page = 0) => {
    if (value == null) {
        return { content: [], page: { number: page, totalPages: 0, totalElements: 0 }, last: true };
    }
    if (Array.isArray(value)) {
        return {
            content: value,
            page: { number: page, totalPages: value.length > 0 ? 1 : 0, totalElements: value.length },
            last: true,
        };
    }
    if (Array.isArray(value.content)) return value;
    throw new Error('목록 응답 형식을 확인할 수 없어요.');
};

export const listRows = value => normalizeListPage(value).content;
