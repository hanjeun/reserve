import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

// 주소는 계속 보관하고 서버의 30일 출처 확인 주기에 맞춰 다시 조회한다.
const PHOTO_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const MISSING_PHOTO_CACHE_MS = 15 * 60 * 1000;
const photoCacheKey = region => `reserve:region-photo:v1:${region}`;
const isProxyPhoto = (photo, region) => photo?.region === region
    && photo.imageUrl === `${API_ENDPOINTS.TOURISM.REGION_PHOTOS}/${region}/image`;
const toDisplayPhoto = photo => ({ ...photo, src: photo.imageUrl });
const displayPhotos = entries => Array.from(entries, entry => entry?.photo).filter(Boolean).map(toDisplayPhoto);

function readPhoto(region) {
    try {
        const entry = JSON.parse(window.localStorage.getItem(photoCacheKey(region)));
        if (entry?.photo === null || isProxyPhoto(entry?.photo, region)) return entry;
    } catch {
        // 브라우저 저장소를 읽을 수 없어도 사진 조회는 진행한다.
    }
    return undefined;
}

function cachePhoto(region, photo) {
    const entry = { photo, checkAfter: Date.now() + (photo ? PHOTO_RECHECK_MS : MISSING_PHOTO_CACHE_MS) };
    try {
        window.localStorage.setItem(photoCacheKey(region), JSON.stringify(entry));
    } catch {
        // 브라우저 저장소가 막혀도 방금 받은 사진은 표시한다.
    }
    return entry;
}

const tourismService = {
    getCachedRegionPhotos: regions => displayPhotos(regions.map(readPhoto)),
    getRegionPhotos: async (regions) => {
        const byRegion = new Map(regions.map(region => [region, readPhoto(region)]));
        const now = Date.now();
        const due = regions.filter(region => {
            const entry = byRegion.get(region);
            return !((entry?.checkAfter ?? entry?.expiresAt) > now);
        });
        if (due.length) {
            const photos = await api.get(API_ENDPOINTS.TOURISM.REGION_PHOTOS, {
                params: { regions: due.join(',') },
            });
            if (Array.isArray(photos)) {
                for (const region of due) {
                    const photo = photos.find(candidate => isProxyPhoto(candidate, region)) ?? null;
                    byRegion.set(region, cachePhoto(region, photo));
                }
            }
        }
        return displayPhotos(byRegion.values());
    },
    getRegionPhotoCatalog: () => api.get(API_ENDPOINTS.TOURISM.REGION_PHOTO_CATALOG),
};

export default tourismService;
