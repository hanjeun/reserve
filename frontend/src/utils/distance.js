/**
 * RESERVE - 거리 계산 유틸
 * 백엔드 ReservationService/StoreService의 Haversine 공식과 동일한 로직의 프론트엔드 버전.
 * "우리동네" 배지처럼 백엔드 API 호출 없이 클라이언트에서 즉시 거리를 판단해야 할 때 사용.
 */

const EARTH_RADIUS_KM = 6371;

/** 두 좌표 간 거리(km) — 하나라도 없으면 null */
export const haversineKm = (lat1, lng1, lat2, lng2) => {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
};

/** "우리동네" 배지 기준 거리 (km) */
export const NEARBY_THRESHOLD_KM = 3;

/** userLocation({latitude,longitude})과 가게 좌표가 기준 거리 이내인지 */
export const isNearby = (userLocation, storeLat, storeLng) => {
    if (!userLocation?.latitude || !userLocation?.longitude) return false;
    const dist = haversineKm(userLocation.latitude, userLocation.longitude, storeLat, storeLng);
    return dist != null && dist <= NEARBY_THRESHOLD_KM;
};
