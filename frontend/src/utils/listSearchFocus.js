/** Focus the current page's existing list control, including when other workspace panels stay mounted. */
export function focusActiveListSearch(reducedMotion = false) {
    const input = [...document.querySelectorAll('.reserve-filter-toolbar input')].find(field => !field.disabled
        && !field.closest('[hidden], [inert], [aria-hidden="true"], .ant-tabs-tabpane-hidden') && field.getClientRects().length > 0);
    if (!input) return false;
    input.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
    input.focus({ preventScroll: true });
    return true;
}
