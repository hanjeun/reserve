import React, { useEffect, useRef, useState } from 'react';
import { Typography, Tag, Upload } from 'antd';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { PlusOutlined, CreditCardOutlined, CloseOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, DataState, FormModal, FormField, FormInput, FormTextArea, FormSelect, FormDatePicker, SegmentedControl, AdminTableSkeleton, DataTable, FilterMenu, FilterToolbar } from '../common';
import { useAdPayment, useMessage, useImagePreview, useMyStores, useFormErrors, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adKeys } from '../../hooks/queryKeys';
import { invalidateAdData } from '../../hooks/invalidateAfterWrite';
import adService from '../../services/adService';
import { getDetailImageUrl } from '../../utils/image';
import {
    IMAGE_ACCEPT,
    MAX_IMAGE_REQUEST_BYTES,
    MAX_IMAGE_REQUEST_MB,
    imageFileError,
    uploadListBytes,
} from '../../utils/imageUploadPolicy';
import { colors, fontSize } from '../../styles/tokens';
import {
    AD_TYPE_LABELS,
    BANNER_DESCRIPTION_MAX_LENGTH,
    BANNER_TITLE_MAX_LENGTH,
    DEFAULT_BANNER_COPY_KEY,
    bannerCopyOptions,
    findBannerCopyKey,
    getBannerCopyPreset,
} from '../../constants';
import {
    DEFAULT_BANNER_MOTION_KEY,
    findBannerMotionKey,
} from '../../constants';
import BannerMotionPicker from './BannerMotionPicker';
import AdCreationPreview from './AdCreationPreview';

const { Text } = Typography;

// 가격은 바로 위 안내 문구에서 이미 안내되므로, 가게 선택과 한 줄에 놓을 때 좋게 짧게 유지
const AD_TYPE_OPTIONS = [
    { value: 'BADGE', label: AD_TYPE_LABELS.BADGE },
    { value: 'BANNER', label: AD_TYPE_LABELS.BANNER },
];

const AD_LIST_QUERY_DEFAULTS = Object.freeze({
    advertisementSearch: '',
    advertisementStore: 'ALL',
    advertisementPage: '0',
});

// 하루 노출 금액 — 결제 화면에 "하루 금액 × 일수"로 계산 근거를 보여준다. 최종 금액은 서버가 다시 계산해 확인한다.
const AD_DAILY_PRICE = { BADGE: 1_000, BANNER: 5_000 };
const PAGE_SIZE = 20;
const EMPTY_ADS = [];

const STATUS_LABELS = {
    PENDING_PAYMENT: { label: '결제 대기', color: 'default' },
    PAYMENT_FAILED:  { label: '결제 실패', color: 'error' },
    ACTIVE:          { label: '노출 중',   color: 'success' },
    EXPIRED:         { label: '만료됨',    color: 'default' },
    SUSPENDED:       { label: '중단됨',    color: 'error' },
    CANCELLED:       { label: '취소됨',    color: 'default' },
    REFUNDED:        { label: '환불됨',    color: 'default' },
    REFUND_PENDING:  { label: '환불 확인 중', color: 'warning' },
    REVIEW_REQUIRED: { label: '결제 확인 필요', color: 'warning' },
};

// 결제 가능한 상태 — 아직 결제 전(대기)이거나 결제가 실패한 경우
const PAYABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED']);

// 취소 요청 가능 여부다. 완료 여부는 서버 원장과 PG 대사가 결정한다.
const CANCELLABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED', 'ACTIVE']);

// 수정 가능한 상태 — 백엔드 updateAd와 동일한 규칙(CANCELLED/EXPIRED/SUSPENDED/REFUNDED는 수정 불가)
const EDITABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED', 'ACTIVE']);

// 종료상태(만료/취소/환불/중단) — 목록에서 직접 숨길 수 있는 상태(소프트삭제) — 2026-07 추가,
// 백엔드 AdvertisementService.removeAd와 동일한 규칙
const REMOVABLE_STATUSES = new Set(['EXPIRED', 'CANCELLED', 'REFUNDED', 'SUSPENDED']);

const MAX_BANNER_IMAGES = 1;
const DEFAULT_BANNER_COPY = getBannerCopyPreset(DEFAULT_BANNER_COPY_KEY);
const isPastStartDate = (ad) => Boolean(ad?.startDate && ad.startDate < dayjs().format('YYYY-MM-DD'));

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 값을 유지 (2026-07 전수조사)
// 예전엔 cols/headers를 아예 안 넘겨서 기본값 6칸 + 헤더까지 회색 막대로 그려졌다.
const SKELETON_HEADERS = ['가게', '유형', '기간', '금액', '상태', '처리'];
const SKELETON_COLS    = [220, 90, 190, 100, 100, 220];

// 마지막 페이지에서는 남은 행 수만 그려 로딩 전후 테이블 높이가 튀지 않게 한다.
const skeletonRowCount = (total, page, pageSize) => {
    if (!total) return Math.min(8, pageSize);
    const remaining = total - page * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

/**
 * 사업자 광고 관리 탭 — 내 광고 목록 + 새 광고 신청(결제).
 * 가격: BADGE 1,000원/일, BANNER 5,000원/일 (예시값, 추후 조정 가능)
 *
 * 2026-07-09: TanStack Query로 전환 — 목록은 useQuery(adKeys.my()), 결제는 useAdPayment
 * 내부에서 useMutation으로 처리되며 성공 시 같은 쿼리 키를 무효화해서 자동 반영됨(수동 refetch 불필요).
 * 가게 목록도 useMyStores()를 재사용해서 "내 가게" 페이지와 캐시를 공유함.
 */
const AdManageTab = () => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const { pay, payExisting, paying, payingId } = useAdPayment();
    const { stores: myStores, loading: storesLoading, error: storesError, refetch: refetchStores } = useMyStores();
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();
    const [modalOpen, setModalOpen] = useState(false);
    const [createStep, setCreateStep] = useState('details');
    // 미리보기 → 이전은 앞으로 갈 때(오른쪽에서)의 반대 방향으로 돌아온다(들어가기·나가기 짝, 2026-09-23).
    const [createStepBack, setCreateStepBack] = useState(false);
    const goToCreateStep = (step) => {
        setCreateStepBack(step === 'details' && createStep === 'preview');
        setCreateStep(step);
    };
    const [{ advertisementSearch, advertisementStore, advertisementPage }, setAdListParams] = useQueryParamsState(AD_LIST_QUERY_DEFAULTS);
    const search = advertisementSearch;
    const debouncedSearch = useDebounce(search, 300);
    // 2026-07 추가 — ReservationTab과 동일한 가게 필터 컨벤션(FilterToolbar selects,
    // 가게 2개 이상일 때만 노출, "전체 가게" 옵션 포함)
    const storeFilter = advertisementStore;
    const page = Math.max(0, Number.parseInt(advertisementPage, 10) || 0);

    const [storeId, setStoreId] = useState(undefined);
    const [adType, setAdType] = useState('BADGE');
    const [bannerCopyKey, setBannerCopyKey] = useState(DEFAULT_BANNER_COPY_KEY);
    const [bannerTitle, setBannerTitle] = useState(DEFAULT_BANNER_COPY.title);
    const [bannerDescription, setBannerDescription] = useState(DEFAULT_BANNER_COPY.description);
    const [bannerMotionKey, setBannerMotionKey] = useState(DEFAULT_BANNER_MOTION_KEY);
    const [dateRange, setDateRange] = useState(null);
    // 가게 등록 폼(StoreImages)과 동일한 picture-card fileList 패턴 — 여러 장 지원
    const [imageFiles, setImageFiles] = useState([]);
    const [imagePreviewUrl, setImagePreviewUrl] = useState('');
    const imagePreviewUrlRef = useRef('');

    // 2026-07 추가 — 배너 광고 수정용 별도 모달 state. 새 신청 모달과 달리 가게/유형/기간이 없어서
    // 그 모달을 그대로 재사용하기 애매해 별도로 둔다. editTarget이 null이면 닫힌 상태.
    const [editTarget, setEditTarget] = useState(null);

    const { errors, validate, clearError, resetErrors } = useFormErrors();
    const {
        errors: editErrors,
        validate: validateEdit,
        clearError: clearEditError,
        resetErrors: resetEditErrors,
    } = useFormErrors();
    const [editBannerCopyKey, setEditBannerCopyKey] = useState(undefined);
    const [editBannerTitle, setEditBannerTitle] = useState('');
    const [editBannerDescription, setEditBannerDescription] = useState('');
    const [editBannerMotionKey, setEditBannerMotionKey] = useState(DEFAULT_BANNER_MOTION_KEY);
    const [editImageFiles, setEditImageFiles] = useState([]);
    const selectedStore = myStores.find(store => store.id === storeId);
    const exposureDays = dateRange?.[0] && dateRange?.[1]
        ? dateRange[1].startOf('day').diff(dateRange[0].startOf('day'), 'day') + 1
        : 0;
    const dailyPrice = AD_DAILY_PRICE[adType] ?? 0;
    const estimatedAmount = Math.max(0, exposureDays) * dailyPrice;

    const releaseImagePreviewUrl = () => {
        if (imagePreviewUrlRef.current.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(imagePreviewUrlRef.current);
        }
        imagePreviewUrlRef.current = '';
        setImagePreviewUrl('');
    };

    useEffect(() => () => {
        if (imagePreviewUrlRef.current.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
            URL.revokeObjectURL(imagePreviewUrlRef.current);
        }
    }, []);

    const { data, isLoading: loading, isFetching, isPlaceholderData, error: adsError, refetch } = useQuery({
        queryKey: adKeys.my({ page, size: PAGE_SIZE, storeFilter, search: debouncedSearch.trim() }),
        queryFn: async () => {
            const result = await adService.getMyAds(
                page,
                PAGE_SIZE,
                storeFilter === 'ALL' ? undefined : Number(storeFilter),
                debouncedSearch,
            );
            return {
                ads: result?.content ?? [],
                // Spring Boot 3.5는 페이지 메타를 page 아래에 둔다. 구 응답은 호환 폴백으로만 읽는다.
                totalElements: result?.page?.totalElements ?? result?.totalElements ?? 0,
            };
        },
        placeholderData: keepPreviousData,
    });
    const ads = data?.ads ?? EMPTY_ADS;
    const totalElements = data?.totalElements ?? 0;
    const cancelMutation = useMutation({
        mutationFn: (adId) => adService.cancelAd(adId),
        onSuccess: () => message.success('취소 요청을 접수했습니다. 환불 여부는 광고 내역에서 확인해주세요.'),
        onError: (err) => message.error(err instanceof Error ? err.message : '결과를 확인하지 못했습니다. 내역을 다시 확인해주세요.'),
        // 노출 중이던 광고를 취소하면 공개 배너·배지와 통계의 광고 요약도 바뀐다.
        onSettled: () => invalidateAdData(queryClient),
    });

    // 종료상태 광고 목록에서 숨기기(소프트삭제) — 2026-07 추가, 예약 쪽 "삭제"와 동일한 패턴
    // 이미 끝난 광고를 내 목록에서만 감춘다 — 공개 노출·통계에는 영향이 없어 my() 만 무효화한다.
    const removeMutation = useMutation({
        mutationFn: (adId) => adService.removeAd(adId),
        onSuccess: () => {
            message.success('목록에서 삭제되었습니다.');
            queryClient.invalidateQueries({ queryKey: adKeys.my() });
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '삭제에 실패했습니다.'),
    });

    // 2026-07 추가 — 배너 광고 수정 mutation. 새 이미지를 고르지 않으면 images를 보내지 않아
    // 백엔드가 기존 이미지를 그대로 유지하게 한다(AdUpdateRequest 규칙).
    const updateMutation = useMutation({
        mutationFn: ({ adId, formData }) => adService.updateAd(adId, formData),
        onSuccess: () => {
            message.success('광고가 수정되었습니다.');
            // 배너 문구·이미지는 공개 목록의 배너에도 보인다.
            invalidateAdData(queryClient);
            setEditTarget(null);
            resetEditErrors();
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '수정에 실패했습니다.'),
    });

    const handleBannerCopyChange = (key) => {
        const preset = getBannerCopyPreset(key);
        if (!preset) return;
        setBannerCopyKey(key);
        setBannerTitle(preset.title);
        setBannerDescription(preset.description);
        clearError('bannerTitle');
        clearError('bannerDescription');
    };

    const handleEditBannerCopyChange = (key) => {
        const preset = getBannerCopyPreset(key);
        if (!preset) return;
        setEditBannerCopyKey(key);
        setEditBannerTitle(preset.title);
        setEditBannerDescription(preset.description);
        clearEditError('bannerTitle');
        clearEditError('bannerDescription');
    };

    const resetForm = () => {
        setCreateStep('details');
        setCreateStepBack(false);
        setStoreId(undefined);
        setAdType('BADGE');
        setBannerCopyKey(DEFAULT_BANNER_COPY_KEY);
        setBannerTitle(DEFAULT_BANNER_COPY.title);
        setBannerDescription(DEFAULT_BANNER_COPY.description);
        setBannerMotionKey(DEFAULT_BANNER_MOTION_KEY);
        setDateRange(null);
        setImageFiles([]);
        releaseImagePreviewUrl();
        // 모달을 닫았다 다시 열었을 때 지난 오류가 남아 있으면 안 된다.
        resetErrors();
    };

    const closeCreateModal = () => {
        if (paying) return;
        setModalOpen(false);
        resetForm();
    };

    const closeEditModal = () => {
        if (updateMutation.isPending) return;
        setEditTarget(null);
        resetEditErrors();
    };

    const beforeUploadImage = (file) => {
        const error = imageFileError(file);
        if (!error) return false;
        message.error(error);
        return Upload.LIST_IGNORE;
    };

    const withinImageRequestLimit = (fileList) => {
        if (uploadListBytes(fileList) <= MAX_IMAGE_REQUEST_BYTES) return true;
        message.error(`새로 올리는 이미지 전체 합계는 ${MAX_IMAGE_REQUEST_MB}MB 이하여야 합니다.`);
        return false;
    };

    const handleImagesChange = ({ fileList }) => {
        const next = fileList.slice(0, MAX_BANNER_IMAGES);
        if (!withinImageRequestLimit(next)) return;
        setImageFiles(next);
        releaseImagePreviewUrl();
        const file = next[0];
        const previewUrl = file?.originFileObj && typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(file.originFileObj)
            : file?.thumbUrl || file?.url || '';
        imagePreviewUrlRef.current = previewUrl;
        setImagePreviewUrl(previewUrl);
        clearError('images');
    };

    const validateCreateForm = () => validate((e) => {
        if (!storeId) e.storeId = '가게를 선택해주세요.';
        if (!dateRange?.[0] || !dateRange?.[1]) {
            e.dateRange = '노출 기간을 선택해주세요.';
        } else if (dateRange[0].startOf('day').isBefore(dayjs().startOf('day'))) {
            e.dateRange = '노출 시작일은 오늘 이후로 선택해주세요.';
        }
        if (adType === 'BANNER' && imageFiles.length === 0) {
            e.images = '배너 광고는 이미지가 최소 1장 필요합니다.';
        }
        if (adType === 'BANNER' && !bannerTitle.trim()) {
            e.bannerTitle = '광고 제목을 입력해주세요.';
        }
        if (adType === 'BANNER' && !bannerDescription.trim()) {
            e.bannerDescription = '광고 내용을 입력해주세요.';
        }
    });

    const handleShowPreview = () => {
        if (!validateCreateForm()) return;
        goToCreateStep('preview');
    };

    const handleSubmit = async () => {
        // 틀린 칸을 한 번에 모아 각 칸 아래에 붙인다.
        // 예전엔 message.warning 을 세 번 이어 붙여서 ① 첫 오류만 알려주고(고치면 다음 게 또 뜬다)
        // ② 토스트가 사라지면 어느 칸이 문제였는지 알 수 없었다.
        // 배너 필수 조건은 원래 한 덩어리(이미지+제목)로 묶여 있었는데, 실제로 비어 있는 건
        // 둘 중 하나일 수 있으므로 칸별로 갈라서 표시한다.
        if (!validateCreateForm()) {
            goToCreateStep('details');
            return;
        }

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

        const result = await pay(formData);
        if (result.success) {
            setModalOpen(false);
            resetForm();
        }
    };

    const handlePay = (ad) => payExisting(ad.id);

    // 2026-07 추가 — 수정 모달 열기. 기존 title/description은 그대로 프리필하고, 기존 이미지는
    // antd Upload가 인식하는 최소 형태({ uid, name, status: 'done', url })로 변환해서 보여준다
    // (사용자가 지우지 않는 한 그 그대로 유지되고, 새로 고르면 전체 교체된다 — AdUpdateRequest 규칙과 일치).
    const handleEdit = (ad) => {
        setEditTarget(ad);
        setEditBannerCopyKey(findBannerCopyKey(ad));
        setEditBannerTitle(ad.title || DEFAULT_BANNER_COPY.title);
        setEditBannerDescription(ad.description || DEFAULT_BANNER_COPY.description);
        setEditBannerMotionKey(findBannerMotionKey(ad));
        resetEditErrors();
        setEditImageFiles((ad.imageUrls || []).slice(0, MAX_BANNER_IMAGES).map((url, i) => ({
            uid: `existing-${i}`,
            name: `image-${i + 1}`,
            status: 'done',
            url: getDetailImageUrl(url),
        })));
    };

    const handleEditImagesChange = ({ fileList }) => {
        const next = fileList.slice(0, MAX_BANNER_IMAGES);
        if (withinImageRequestLimit(next)) setEditImageFiles(next);
    };

    const handleUpdateSubmit = async () => {
        if (!validateEdit((e) => {
            if (!editBannerTitle.trim()) e.bannerTitle = '광고 제목을 입력해주세요.';
            if (!editBannerDescription.trim()) e.bannerDescription = '광고 내용을 입력해주세요.';
        })) return;

        const formData = new FormData();
        if (editBannerCopyKey) formData.append('bannerCopyKey', editBannerCopyKey);
        formData.append('title', editBannerTitle.trim());
        formData.append('description', editBannerDescription.trim());
        formData.append('bannerMotionKey', editBannerMotionKey);
        // 사용자가 새로 고른 파일(originFileObj 있음)만 보낸다 — 기존 이미지(url만 있고 originFileObj 없음)만
        // 있고 새로 고른 파일이 하나도 없으면 images 자체를 안 보내서 백엔드가 기존 이미지를 유지하게 한다.
        const newFiles = editImageFiles.filter((f) => f.originFileObj);
        newFiles.forEach((f) => formData.append('images', f.originFileObj));

        await updateMutation.mutateAsync({ adId: editTarget.id, formData });
    };

    const visibleCount = totalElements;

    const handleCancel = (ad) => {
        const isPaid = ad.status === 'ACTIVE';
        confirm({
            title: '광고 취소',
            content: isPaid
                ? `노출을 중단하고 ${ad.amount?.toLocaleString()}원 전액 환불을 요청합니다. 환불 완료는 PG 확인 후 표시됩니다.`
                : '신청을 취소하고 결제 상태를 확인합니다. 결제 중이었다면 미결 내역이 남을 수 있으며, 확인 후 환불을 처리합니다.',
            okText: isPaid ? '환불하기' : '취소하기', cancelText: '닫기',
            okButtonProps: { danger: true }, centered: true,
            onOk: () => cancelMutation.mutateAsync(ad.id),
        });
    };

    // 종료상태 광고를 목록에서 지우기 — 예약 쪽 handleRemove와 동일한 확인 문구 패턴
    const handleRemove = (ad) => {
        confirm({
            title: '광고 삭제',
            content: '이 광고를 목록에서 삭제합니다. 결제/노출 이력은 삭제되지 않고 관리자 측에서만 보관됩니다.',
            okText: '삭제', cancelText: '취소',
            okButtonProps: { danger: true }, centered: true,
            onOk: () => removeMutation.mutateAsync(ad.id),
        });
    };

    const columns = [
        { title: '가게', dataIndex: 'storeName', key: 'storeName', width: 220, ellipsis: true },
        {
            title: '유형', dataIndex: 'adType', key: 'adType', width: 90,
            render: (v) => AD_TYPE_LABELS[v] || v,
        },
        { title: '기간', key: 'period', width: 190, render: (_, r) => `${r.startDate} ~ ${r.endDate}` },
        { title: '금액', dataIndex: 'amount', key: 'amount', width: 100, render: (v) => `${v?.toLocaleString()}원` },
        {
            title: '상태', dataIndex: 'status', key: 'status', width: 100,
            render: (v, r) => {
                if (PAYABLE_STATUSES.has(v) && isPastStartDate(r)) {
                    return <Tag color="default">기간 경과</Tag>;
                }
                return <Tag color={STATUS_LABELS[v]?.color}>{STATUS_LABELS[v]?.label || v}</Tag>;
            },
        },
        {
            title: '처리', key: 'actions', width: 220,
            render: (_, r) => (
                <div style={{ display: 'flex', gap: 8 }}>
                    {PAYABLE_STATUSES.has(r.status) && !isPastStartDate(r) && (
                        <Button variant="ghost-sm-primary" loading={payingId === r.id} onClick={() => handlePay(r)}>
                            <CreditCardOutlined /> 결제
                        </Button>
                    )}
                    {r.adType === 'BANNER' && EDITABLE_STATUSES.has(r.status) && (
                        <Button variant="ghost-sm" onClick={() => handleEdit(r)}>
                            <EditOutlined /> 수정
                        </Button>
                    )}
                    {CANCELLABLE_STATUSES.has(r.status) && (
                        <Button variant="ghost-sm-danger" loading={cancelMutation.isPending && cancelMutation.variables === r.id} onClick={() => handleCancel(r)}>
                            <CloseOutlined /> {r.status === 'ACTIVE' ? '환불' : '취소'}
                        </Button>
                    )}
                    {REMOVABLE_STATUSES.has(r.status) && (
                        <Button variant="ghost-sm" loading={removeMutation.isPending && removeMutation.variables === r.id} onClick={() => handleRemove(r)} style={{ color: colors.text.tertiary }}>
                            <DeleteOutlined /> 삭제
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="reserve-ad-manage-tab">
            <div className="reserve-ad-manage-heading">
                <Text className="reserve-ad-manage-intro" type="secondary" style={{ fontSize: fontSize.sm }}>
                    노출형(1,000원/일)은 가게 목록 상단에 카드·리스트로 우선 노출되고 작은 &quot;광고&quot; 표기가 붙어요. 배너형(5,000원/일)은 화면 우측 하단에 표시돼요.
                </Text>
            </div>

            <div className="reserve-ad-manage-primary-row">
                <Button variant="primary" size="sm" onClick={() => setModalOpen(true)} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                    새 광고 신청
                </Button>
                <div className="reserve-ad-manage-store-summary">
                    <FilterMenu
                        appearance="plain"
                        value={storeFilter}
                        onChange={value => setAdListParams({ advertisementStore: value, advertisementPage: '0' })}
                        options={[
                            { value: 'ALL', label: '전체 가게' },
                            ...myStores.map(s => ({ value: String(s.id), label: s.name })),
                        ]}
                        disabled={loading || storesLoading || Boolean(storesError)}
                        loading={storesLoading}
                        aria-label="광고 가게 필터"
                    />
                    {!loading && (
                        <Text type="secondary" className="reserve-ad-manage-count">
                            {visibleCount.toLocaleString('ko-KR')}건
                        </Text>
                    )}
                </div>
            </div>

            <FilterToolbar
                search={{ value: search, onChange: (e) => setAdListParams({ advertisementSearch: e.target.value, advertisementPage: '0' }), placeholder: '가게명으로 검색' }}
                onReload={refetch}
                loading={loading || isFetching}
            />

            {/* 가게 선택지는 목록과 별도 요청이다. 실패해도 전체 광고 목록은 그대로 두고,
                필터 아래의 결과 영역에서 원인과 재시도를 제공한다. */}
            {storesError && (
                <DataState state="error" kind="store" subject="가게 필터 목록" error={storesError}
                    onRetry={refetchStores} retrying={storesLoading} compact style={{ marginBottom: 16 }} />
            )}

            {/* 로딩 조건 통일(2026-07 전수조사): 예전엔 ads.length === 0 조건 때문에 새로고침이나
                광고 신청/취소 후 재조회 시엔 아무 로딩 신호도 없었다 — 관리자 탭들과 동일하게 통일. */}
            {adsError ? (
                <DataState state="error" kind="advertisement" subject="광고 목록" error={adsError}
                    onRetry={refetch} retrying={isFetching} compact />
            ) : (loading || isPlaceholderData) ? (
                <AdminTableSkeleton
                    rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={2}
                    pagination={totalElements ? { current: page + 1, pageSize: PAGE_SIZE, total: totalElements } : null}
                />
            ) : (
                <DataTable
                    rowKey="id"
                    columns={columns}
                    dataSource={ads}
                    pagination={{
                        current: page + 1,
                        pageSize: PAGE_SIZE,
                        total: totalElements,
                        showSizeChanger: false,
                        onChange: (nextPage) => setAdListParams({ advertisementPage: String(nextPage - 1) }),
                    }}
                    locale={{ emptyText: '신청한 광고가 없습니다.' }}
                />
            )}

            <FormModal
                title={createStep === 'details' ? '새 광고 신청' : '광고 미리보기'}
                open={modalOpen}
                onClose={closeCreateModal}
                onSubmit={createStep === 'details' ? handleShowPreview : handleSubmit}
                onCancelAction={createStep === 'details' ? closeCreateModal : () => goToCreateStep('details')}
                submitting={paying}
                width={createStep === 'preview' ? 680 : 520}
                submitText={createStep === 'details' ? '미리보기' : '결제하기'}
                cancelText={createStep === 'details' ? '취소' : '이전'}
                rootClassName="reserve-ad-create-modal"
                scrollResetKey={createStep}
            >
                {createStep === 'details' ? (
                    <div key="ad-details" className={'reserve-ad-create-page' + (createStepBack ? ' reserve-ad-create-page--back' : '')}>
                        {storesError && (
                            <DataState state="error" kind="store" subject="가게 목록" error={storesError}
                                onRetry={refetchStores} retrying={storesLoading} compact />
                        )}
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <FormField label="가게" error={errors.storeId}>
                                    <FormSelect
                                        className="reserve-ad-store-select"
                                        placeholder="가게 선택"
                                        loading={storesLoading}
                                        disabled={storesLoading || Boolean(storesError)}
                                        value={storeId}
                                        onChange={(v) => { setStoreId(v); clearError('storeId'); }}
                                        options={myStores.map((s) => ({ value: s.id, label: s.name }))}
                                    />
                                </FormField>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <FormField label="광고 유형">
                                    <SegmentedControl
                                        value={adType}
                                        onChange={(value) => { setAdType(value); clearError('images'); }}
                                        options={AD_TYPE_OPTIONS}
                                    />
                                </FormField>
                            </div>
                        </div>
                        <FormField label="노출 기간" error={errors.dateRange}>
                            <FormDatePicker.RangePicker
                                value={dateRange}
                                onChange={(v) => { setDateRange(v); clearError('dateRange'); }}
                                highlightHolidays
                            />
                        </FormField>
                        {adType === 'BANNER' && (
                            <>
                                <FormField label="추천 문구">
                                    <Text type="secondary" style={{ fontSize: fontSize.xs, display: 'block', marginBottom: 8 }}>
                                        예시를 고른 뒤 아래 제목과 내용을 자유롭게 수정할 수 있어요.
                                    </Text>
                                    <FormSelect
                                        aria-label="추천 문구"
                                        value={bannerCopyKey}
                                        onChange={handleBannerCopyChange}
                                        options={bannerCopyOptions}
                                    />
                                </FormField>
                                <FormField label="제목" error={errors.bannerTitle}>
                                    <FormInput
                                        aria-label="광고 제목"
                                        value={bannerTitle}
                                        onChange={(event) => { setBannerTitle(event.target.value); clearError('bannerTitle'); }}
                                        maxLength={BANNER_TITLE_MAX_LENGTH}
                                        showCount
                                    />
                                </FormField>
                                <FormField label="내용" error={errors.bannerDescription}>
                                    <FormTextArea
                                        aria-label="광고 내용"
                                        rows={2}
                                        value={bannerDescription}
                                        onChange={(event) => { setBannerDescription(event.target.value); clearError('bannerDescription'); }}
                                        maxLength={BANNER_DESCRIPTION_MAX_LENGTH}
                                        showCount
                                    />
                                </FormField>
                                <FormField label="등장 효과">
                                    <BannerMotionPicker value={bannerMotionKey} onChange={setBannerMotionKey} />
                                </FormField>
                                <FormField label={`배너 대표 이미지 (1장 · 새 파일 ${MAX_IMAGE_REQUEST_MB}MB 이하)`} error={errors.images}>
                                    <Text type="secondary" style={{ fontSize: fontSize.xs, display: 'block', marginBottom: 8 }}>
                                        정사각형 이미지(권장 1:1, 예: 800×800px) 한 장을 올려주세요. 다른 비율은 가운데를 기준으로 잘릴 수 있어요.
                                    </Text>
                                    <Upload
                                        listType="picture-card"
                                        accept={IMAGE_ACCEPT}
                                        fileList={imageFiles}
                                        onChange={handleImagesChange}
                                        onPreview={(file) => handlePreview(file, imageFiles)}
                                        beforeUpload={beforeUploadImage}
                                        maxCount={MAX_BANNER_IMAGES}
                                        onClickCapture={suppressLinkNavigation}
                                    >
                                        {imageFiles.length < MAX_BANNER_IMAGES && (
                                            <div>
                                                <PlusOutlined />
                                                <div style={{ marginTop: 8 }}>업로드</div>
                                            </div>
                                        )}
                                    </Upload>
                                </FormField>
                                {previewNode}
                            </>
                        )}
                    </div>
                ) : (
                    <div key="ad-preview" className="reserve-ad-create-page reserve-ad-create-page--preview">
                        <AdCreationPreview
                            adType={adType}
                            store={selectedStore}
                            copy={{ title: bannerTitle, description: bannerDescription }}
                            motionKey={bannerMotionKey}
                            imageSrc={imagePreviewUrl || imageFiles[0]?.thumbUrl || imageFiles[0]?.url}
                            startDate={dateRange[0].format('YYYY-MM-DD')}
                            endDate={dateRange[1].format('YYYY-MM-DD')}
                            exposureDays={exposureDays}
                            dailyPrice={dailyPrice}
                            amount={estimatedAmount}
                        />
                    </div>
                )}
            </FormModal>

            {/* 가게/유형/기간은 결제 금액과 연결되므로 문구 프리셋과 대표 이미지만 수정한다. */}
            <FormModal
                title={editTarget ? `배너 광고 수정 — ${editTarget.storeName}` : '배너 광고 수정'}
                open={!!editTarget}
                onClose={closeEditModal}
                onSubmit={handleUpdateSubmit}
                submitting={updateMutation.isPending}
                submitText="저장"
            >
                <FormField label="추천 문구">
                    <Text type="secondary" style={{ fontSize: fontSize.xs, display: 'block', marginBottom: 8 }}>
                        추천을 적용해도 제목과 내용은 다시 수정할 수 있어요.
                    </Text>
                    <FormSelect
                        aria-label="추천 문구"
                        placeholder="추천 문구 선택"
                        value={editBannerCopyKey}
                        onChange={handleEditBannerCopyChange}
                        options={bannerCopyOptions}
                    />
                </FormField>
                <FormField label="제목" error={editErrors.bannerTitle}>
                    <FormInput
                        aria-label="광고 제목"
                        value={editBannerTitle}
                        onChange={(event) => { setEditBannerTitle(event.target.value); clearEditError('bannerTitle'); }}
                        maxLength={BANNER_TITLE_MAX_LENGTH}
                        showCount
                    />
                </FormField>
                <FormField label="내용" error={editErrors.bannerDescription}>
                    <FormTextArea
                        aria-label="광고 내용"
                        rows={2}
                        value={editBannerDescription}
                        onChange={(event) => { setEditBannerDescription(event.target.value); clearEditError('bannerDescription'); }}
                        maxLength={BANNER_DESCRIPTION_MAX_LENGTH}
                        showCount
                    />
                </FormField>
                <FormField label="등장 효과">
                    <BannerMotionPicker value={editBannerMotionKey} onChange={setEditBannerMotionKey} />
                </FormField>
                <FormField label="배너 대표 이미지 (1장)">
                    <Text type="secondary" style={{ fontSize: fontSize.xs, display: 'block', marginBottom: 8 }}>
                        새 이미지를 고르지 않으면 기존 대표 이미지가 유지돼요. 정사각형(1:1)을 권장해요.
                    </Text>
                    <Upload
                        listType="picture-card"
                        accept={IMAGE_ACCEPT}
                        fileList={editImageFiles}
                        onChange={handleEditImagesChange}
                        onPreview={(file) => handlePreview(file, editImageFiles)}
                        beforeUpload={beforeUploadImage}
                        maxCount={MAX_BANNER_IMAGES}
                        onClickCapture={suppressLinkNavigation}
                    >
                        {editImageFiles.length < MAX_BANNER_IMAGES && (
                            <div>
                                <PlusOutlined />
                                <div style={{ marginTop: 8 }}>업로드</div>
                            </div>
                        )}
                    </Upload>
                </FormField>
                {previewNode}
            </FormModal>
        </div>
    );
};

export default AdManageTab;
