import { create } from 'zustand';

/**
 * 세션 동안만 유지되는 "마지막으로 성공한 라이브 위치" 저장소 (localStorage 저장 안 함 — 새로고침하면 사라짐).
 *
 * 왜 필요한가: StoreList.jsx가 "거리순" 정렬을 위해 얻은 Geolocation 좌표를 URL의
 * sort/lat/lng 쿼리파라미터로만 들고 있으면, 다른 정렬(별점순 등)로 바꾸는 순간
 * lat/lng이 초기화되면서 "우리동네" 배지 계산에 쓸 위치도 같이 사라져버림
 * (정렬 파라미터와 배지용 위치가 같은 상태에 묶여있던 게 원인).
 *
 * 이 스토어는 그 둘을 분리한다 — 정렬 파라미터(searchParams.lat/lng)는 정렬 목적으로만 쓰고,
 * "우리동네" 배지는 여기 저장된 liveLocation(한 번 얻으면 세션 내내 유지)을 우선 쓰고,
 * 없으면 마이페이지에 저장된 위치로 폴백한다. StoreDetail.jsx도 이 값을 읽기만 하고
 * 직접 위치 권한을 요청하지는 않는다(StoreCard와 동일한 원칙 유지).
 */
const useLocationStore = create((set) => ({
    liveLocation: null, // { latitude, longitude } | null
    setLiveLocation: (loc) => set({ liveLocation: loc }),
}));

export default useLocationStore;
