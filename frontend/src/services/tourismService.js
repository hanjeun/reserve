import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

// 서버가 반환하는 imageUrl은 검증된 같은 출처 프록시 경로다. 화면 컴포넌트는 src 계약만
// 알면 되므로 여기서 한 번만 맞춘다. 원본 관광 이미지 URL은 이 경계를 넘지 않는다.
const toDisplayPhoto = photo => ({ ...photo, src: photo.imageUrl });

const tourismService = {
    getRegionPhotos: async (regions) => {
        const photos = await api.get(API_ENDPOINTS.TOURISM.REGION_PHOTOS, {
            params: { regions: regions.join(',') },
        });
        return Array.isArray(photos) ? photos.map(toDisplayPhoto) : [];
    },
    getRegionPhotoCatalog: () => api.get(API_ENDPOINTS.TOURISM.REGION_PHOTO_CATALOG),
};

export default tourismService;
