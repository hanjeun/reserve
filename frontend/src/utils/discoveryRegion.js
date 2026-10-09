import { normalizeListQueryParams } from './listQueryParams';

export const DISCOVERY_REGION_STORAGE_KEY = 'reserve:discovery-region';
let memoryRegion = '';
let useMemory = false;

// 목록 URL과 같은 검증을 사용한다. 빈 값은 사용자가 고른 전체 지역이다.
export const validDiscoveryRegion = value => {
    if (typeof value !== 'string') return null;
    if (value === '') return '';
    const params = new URLSearchParams({ region: value });
    return normalizeListQueryParams('/stores', params).get('region');
};

export const readDiscoveryRegion = () => {
    if (useMemory) return memoryRegion;
    try {
        const saved = window.sessionStorage.getItem(DISCOVERY_REGION_STORAGE_KEY);
        memoryRegion = validDiscoveryRegion(saved) ?? '';
    } catch {
        useMemory = true;
    }
    return memoryRegion;
};

export const saveDiscoveryRegion = value => {
    const region = validDiscoveryRegion(value);
    if (region == null) return false;
    memoryRegion = region;
    try {
        window.sessionStorage.setItem(DISCOVERY_REGION_STORAGE_KEY, region);
        useMemory = false;
    } catch {
        // 저장소가 막힌 경우에도 현재 탭에서 이동하는 동안 선택을 유지한다.
        useMemory = true;
    }
    return true;
};
