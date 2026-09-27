const numberOrZero = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

export const filterAndSortOwnedStores = (stores, { domain = '', sort = 'recent' } = {}) => {
    const visible = stores.filter(store => !domain || store.serviceDomain === domain);
    if (sort === 'rating') return [...visible].sort((a, b) => numberOrZero(b.rating) - numberOrZero(a.rating));
    if (sort === 'reviewCount') return [...visible].sort((a, b) => numberOrZero(b.reviewCount) - numberOrZero(a.reviewCount));
    return visible; // 서버의 등록 최신순을 그대로 유지한다.
};
