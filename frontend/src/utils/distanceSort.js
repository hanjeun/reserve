const roundCoordinate = (value) => Math.round(Number(value) * 1000) / 1000;

const isCoordinate = (value, minimum, maximum) => {
    if (value == null || value === '') return false;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= minimum && numericValue <= maximum;
};

export const hasDistanceCoordinates = (latitude, longitude) => (
    isCoordinate(latitude, -90, 90) && isCoordinate(longitude, -180, 180)
);

/**
 * 거리순은 홈과 가게 목록 모두 같은 URL 계약을 사용한다.
 * 좌표는 3자리로 고정해 주소창·쿼리 캐시·서버 정렬 기준이 불필요하게 흔들리지 않게 한다.
 */
export const distanceSortParams = (location) => {
    if (!location || !hasDistanceCoordinates(location.latitude, location.longitude)) return null;

    return {
        sort: 'distance',
        lat: String(roundCoordinate(location.latitude)),
        lng: String(roundCoordinate(location.longitude)),
    };
};
