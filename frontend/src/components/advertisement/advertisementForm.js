import dayjs from 'dayjs';
import { getDetailImageUrl } from '../../utils/image';

export const MAX_BANNER_IMAGES = 1;

export const exposureDaysOf = (dateRange) => (
    dateRange?.[0] && dateRange?.[1]
        ? dateRange[1].startOf('day').diff(dateRange[0].startOf('day'), 'day') + 1
        : 0
);

export const imagePreviewUrlFor = (file) => (
    file?.originFileObj && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file.originFileObj)
        : file?.thumbUrl || file?.url || ''
);

export const collectCreateErrors = (e, { storeId, dateRange, adType, imageFiles, bannerTitle, bannerDescription }) => {
    if (!storeId) e.storeId = '가게를 선택해주세요.';
    if (!dateRange?.[0] || !dateRange?.[1]) {
        e.dateRange = '노출 기간을 선택해주세요.';
    } else if (dateRange[0].startOf('day').isBefore(dayjs().startOf('day'))) {
        e.dateRange = '노출 시작일은 오늘 이후로 선택해주세요.';
    }
    if (adType !== 'BANNER') return;
    if (imageFiles.length === 0) {
        e.images = '배너 광고는 이미지가 최소 1장 필요해요.';
    }
    if (!bannerTitle.trim()) {
        e.bannerTitle = '광고 제목을 입력해주세요.';
    }
    if (!bannerDescription.trim()) {
        e.bannerDescription = '광고 내용을 입력해주세요.';
    }
};

export const buildCreateFormData = ({ storeId, adType, dateRange, bannerCopyKey, bannerTitle, bannerDescription, bannerMotionKey, imageFiles }) => {
    const formData = new FormData();
    formData.append('storeId', storeId);
    formData.append('adType', adType);
    formData.append('startDate', dateRange[0].format('YYYY-MM-DD'));
    formData.append('endDate', dateRange[1].format('YYYY-MM-DD'));
    if (adType === 'BANNER') {
        formData.append('bannerCopyKey', bannerCopyKey);
        formData.append('title', bannerTitle.trim());
        formData.append('description', bannerDescription.trim());
        formData.append('bannerMotionKey', bannerMotionKey);
    }
    imageFiles.forEach((f) => { if (f.originFileObj) formData.append('images', f.originFileObj); });
    return formData;
};

export const buildUpdateFormData = ({ editBannerCopyKey, editBannerTitle, editBannerDescription, editBannerMotionKey, editImageFiles }) => {
    const formData = new FormData();
    if (editBannerCopyKey) formData.append('bannerCopyKey', editBannerCopyKey);
    formData.append('title', editBannerTitle.trim());
    formData.append('description', editBannerDescription.trim());
    formData.append('bannerMotionKey', editBannerMotionKey);
    // 사용자가 새로 고른 파일(originFileObj 있음)만 보낸다 — 기존 이미지(url만 있고 originFileObj 없음)만
    // 있고 새로 고른 파일이 하나도 없으면 images 자체를 안 보내서 백엔드가 기존 이미지를 유지하게 한다.
    const newFiles = editImageFiles.filter((f) => f.originFileObj);
    newFiles.forEach((f) => formData.append('images', f.originFileObj));
    return formData;
};

export const existingImageFiles = (ad) => (ad.imageUrls || []).slice(0, MAX_BANNER_IMAGES).map((url, i) => ({
    uid: `existing-${i}`,
    name: `image-${i + 1}`,
    status: 'done',
    url: getDetailImageUrl(url),
}));
