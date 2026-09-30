const isNumericValue = value => typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '');

/** Store summaries use the same zero-review score and safe API-number handling. */
export function normalizeStoreRating(ratingValue, reviewCountValue) {
    const count = isNumericValue(reviewCountValue) ? Number(reviewCountValue) : Number.NaN;
    const reviewCount = Number.isSafeInteger(count) && count > 0 ? count : 0;
    if (reviewCount === 0) return { rating: 0, reviewCount: 0 };

    const score = isNumericValue(ratingValue) ? Number(ratingValue) : Number.NaN;
    const rating = Number.isFinite(score) && score >= 0 && score <= 5 ? score : 0;
    return { rating, reviewCount };
}
