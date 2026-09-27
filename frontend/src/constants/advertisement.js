export const AD_TYPE_LABELS = Object.freeze({
    BADGE: '노출형',
    BANNER: '배너형',
});

export const BANNER_COPY_PRESETS = [
    {
        value: 'AVAILABLE_NOW',
        title: '지금 예약할 수 있어요',
        description: '원하는 시간을 바로 확인해보세요',
    },
    {
        value: 'DISCOVER_STORE',
        title: '새로운 가게를 만나보세요',
        description: '예약 정보와 이용 시간을 둘러보세요',
    },
    {
        value: 'PLAN_VISIT',
        title: '방문할 곳을 찾고 있나요?',
        description: '내게 맞는 시간을 RESERVE에서 찾아보세요',
    },
];

export const DEFAULT_BANNER_COPY_KEY = BANNER_COPY_PRESETS[0].value;
export const BANNER_TITLE_MAX_LENGTH = 100;
export const BANNER_DESCRIPTION_MAX_LENGTH = 300;

export const getBannerCopyPreset = (value) => BANNER_COPY_PRESETS.find(
    preset => preset.value === value,
);

export const bannerCopyOptions = BANNER_COPY_PRESETS.map(({ value, title }) => ({
    value,
    label: title,
}));

export const findBannerCopyKey = (ad) => BANNER_COPY_PRESETS.find(
    preset => preset.title === ad?.title && preset.description === ad?.description,
)?.value;

export const BANNER_MOTION_PRESETS = [
    {
        value: 'SOFT_RISE',
        label: '부드럽게 올라오기',
        description: '아래에서 살짝 커지며 나타나요',
    },
    {
        value: 'TILT_UP_3D',
        label: '3D로 세워지기',
        description: '누운 카드가 앞쪽으로 세워져요',
    },
];

export const DEFAULT_BANNER_MOTION_KEY = BANNER_MOTION_PRESETS[0].value;

export const normalizeBannerMotionKey = (value) => BANNER_MOTION_PRESETS.some(
    preset => preset.value === value,
) ? value : DEFAULT_BANNER_MOTION_KEY;

export const findBannerMotionKey = (ad) => normalizeBannerMotionKey(ad?.bannerMotionKey);
