export function keepListForSort(data, previousSort, nextSort, previousPage) {
    if (previousSort === nextSort || !Array.isArray(data?.content) || !data.content.length) return undefined;
    return { ...data, previousOrder: { sort: previousSort, page: previousPage } };
}
