import React, { useEffect, useRef, useState } from 'react';
import { Typography, Tag, Upload } from 'antd';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { PlusOutlined, CreditCardOutlined, CloseOutlined, EditOutlined, DeleteOutlined } from '../common/icons';
import { Bone, Button, DataState, FormModal, FormField, FormInput, FormTextArea, FormSelect, FormDatePicker, SegmentedControl, AdminTableSkeleton, DataTable, FilterMenu, FilterToolbar } from '../common';
import { FilterMenuSkeleton } from '../common/FilterToolbarSkeleton';
import SkeletonText from '../common/SkeletonText';
import LoadingUpload from '../common/LoadingUpload';
import { useAdPayment, useMessage, useImagePreview, useMyStores, useFormErrors, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adKeys } from '../../hooks/queryKeys';
import { invalidateAdData } from '../../hooks/invalidateAfterWrite';
import adService from '../../services/adService';
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
    DEFAULT_BANNER_MOTION_KEY,
    findBannerMotionKey,
} from '../../constants';
import BannerMotionPicker from './BannerMotionPicker';
import AdCreationPreview from './AdCreationPreview';
import useWorkspaceDraftGuard from '../../hooks/useWorkspaceDraftGuard';
import { MAX_BANNER_IMAGES, exposureDaysOf, imagePreviewUrlFor, collectCreateErrors, buildCreateFormData, buildUpdateFormData, existingImageFiles } from './advertisementForm';

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

// 결제 전·결제 실패 상태만 결제를 허용한다.
const PAYABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED']);

// 취소 요청 가능 여부다. 완료 여부는 서버 원장과 PG 대사가 결정한다.
const CANCELLABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED', 'ACTIVE']);

// 수정 가능한 상태 — 백엔드 updateAd와 동일한 규칙(CANCELLED/EXPIRED/SUSPENDED/REFUNDED는 수정 불가)
const EDITABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED', 'ACTIVE']);

// 종료 광고는 목록에서 숨길 수 있는 상태로 분류한다.

const REMOVABLE_STATUSES = new Set(['EXPIRED', 'CANCELLED', 'REFUNDED', 'SUSPENDED']);

const DEFAULT_BANNER_COPY = getBannerCopyPreset(DEFAULT_BANNER_COPY_KEY);
const isPastStartDate = (ad) => Boolean(ad?.startDate && ad.startDate < dayjs().format('YYYY-MM-DD'));

// 골격과 실제 테이블은 같은 열 규격을 사용한다.

const SKELETON_HEADERS = ['가게', '유형', '기간', '금액', '상태', '처리'];
const SKELETON_COLS    = [220, 90, 190, 100, 100, 220];

// 마지막 페이지에서는 남은 행 수만 그려 로딩 전후 테이블 높이가 튀지 않게 한다.
const skeletonRowCount = (total, page, pageSize) => {
    if (!total) return Math.min(8, pageSize);
    const remaining = total - page * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

// 노출 일수(양 끝 포함) — 기간이 비어 있으면 0

const revokeBlobUrl = (url) => {
    if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
    }
};

const errorMessageOr = (err, fallback) => (err instanceof Error ? err.message : fallback);

const fetchMyAds = async (page, storeFilter, debouncedSearch) => {
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
};

// 기존 이미지를 antd Upload가 인식하는 최소 형태로 바꾼다.

const cancelConfirmOptions = (ad) => {
    const isPaid = ad.status === 'ACTIVE';
    return {
        title: '광고 취소',
        content: isPaid
            ? `노출을 중단하고 ${ad.amount?.toLocaleString()}원 전액 환불을 요청해요. 환불 완료는 PG 확인 후 표시돼요.`
            : '신청을 취소하고 결제 상태를 확인해요. 결제 중이었다면 미결 내역이 남을 수 있으며, 확인 후 환불을 처리해요.',
        okText: isPaid ? '환불하기' : '취소하기', cancelText: '닫기',
        okButtonProps: { danger: true }, centered: true,
    };
};

const renderStatusTag = (v, r) => {
    if (PAYABLE_STATUSES.has(v) && isPastStartDate(r)) {
        return <Tag color="default">기간 경과</Tag>;
    }
    return <Tag color={STATUS_LABELS[v]?.color}>{STATUS_LABELS[v]?.label || v}</Tag>;
};

const isPendingFor = (mutation, id) => mutation.isPending && mutation.variables === id;

const renderAdActions = (r, { payingId, cancelMutation, removeMutation, onPay, onEdit, onCancel, onRemove }) => (
    <div style={{ display: 'flex', gap: 8 }}>
        {PAYABLE_STATUSES.has(r.status) && !isPastStartDate(r) && (
            <Button variant="ghost-sm-primary" loading={payingId === r.id} onClick={() => onPay(r)}>
                <CreditCardOutlined /> 결제
            </Button>
        )}
        {r.adType === 'BANNER' && EDITABLE_STATUSES.has(r.status) && (
            <Button variant="ghost-sm" onClick={() => onEdit(r)}>
                <EditOutlined /> 수정
            </Button>
        )}
        {CANCELLABLE_STATUSES.has(r.status) && (
            <Button variant="ghost-sm-danger" loading={isPendingFor(cancelMutation, r.id)} onClick={() => onCancel(r)}>
                <CloseOutlined /> {r.status === 'ACTIVE' ? '환불' : '취소'}
            </Button>
        )}
        {REMOVABLE_STATUSES.has(r.status) && (
            <Button variant="ghost-sm" loading={isPendingFor(removeMutation, r.id)} onClick={() => onRemove(r)} style={{ color: colors.text.tertiary }}>
                <DeleteOutlined /> 삭제
            </Button>
        )}
    </div>
);

const buildAdColumns = (actionDeps) => [
    { title: '가게', dataIndex: 'storeName', key: 'storeName', width: 220, ellipsis: true },
    {
        title: '유형', dataIndex: 'adType', key: 'adType', width: 90,
        render: (v) => AD_TYPE_LABELS[v] || v,
    },
    { title: '기간', key: 'period', width: 190, render: (_, r) => `${r.startDate} ~ ${r.endDate}` },
    { title: '금액', dataIndex: 'amount', key: 'amount', width: 100, render: (v) => `${v?.toLocaleString()}원` },
    {
        title: '상태', dataIndex: 'status', key: 'status', width: 100,
        render: renderStatusTag,
    },
    {
        title: '처리', key: 'actions', width: 220,
        render: (_, r) => renderAdActions(r, actionDeps),
    },
];

// 광고 목록 영역 — 오류 / 스켈레톤 / 표 중 하나.
const renderAdsContent = ({ adsError, refetch, isFetching, loading, isPlaceholderData, totalElements, page, columns, ads, onPageChange }) => {
    if (adsError) {
        return (
            <DataState state="error" kind="advertisement" subject="광고 목록" error={adsError}
                onRetry={refetch} retrying={isFetching} />
        );
    }
    if (loading || isPlaceholderData) {
        return (
            <AdminTableSkeleton
                rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                cols={SKELETON_COLS}
                headers={SKELETON_HEADERS}
                actionBtns={2}
                pagination={totalElements ? { current: page + 1, pageSize: PAGE_SIZE, total: totalElements } : null}
            />
        );
    }
    return (
        <DataTable
            rowKey="id"
            columns={columns}
            dataSource={ads}
            pagination={{
                current: page + 1,
                pageSize: PAGE_SIZE,
                total: totalElements,
                showSizeChanger: false,
                onChange: onPageChange,
            }}
            locale={{ emptyText: '신청한 광고가 없어요.' }}
        />
    );
};

// 새 광고 신청 모달의 단계별 제목·폭·버튼 문구
const createModalText = (createStep) => {
    if (createStep === 'details') {
        return { title: '새 광고 신청', width: 520, submitText: '미리보기', cancelText: '취소' };
    }
    return {
        title: '광고 미리보기',
        width: createStep === 'preview' ? 680 : 520,
        submitText: '결제하기',
        cancelText: '이전',
    };
};

/*
 * 내 광고 조회와 결제 후 무효화는 같은 광고 캐시를 사용하며 가게 선택은 내 가게 캐시를 공유한다.
 */
const AdManageTab = () => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const { pay, payExisting, paying, payingId, paymentDialog } = useAdPayment();
    // SDK 모바일 리다이렉트를 beforeunload로 막지 않는다. 메뉴·뒤로가기 이동은 처리 중 계속 막는다.
    useWorkspaceDraftGuard({ busy: paying, allowUnload: paying });
    const { stores: myStores, loading: storesLoading, error: storesError, refetch: refetchStores } = useMyStores();
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();
    const [modalOpen, setModalOpen] = useState(false);
    const [createStep, setCreateStep] = useState('details');
    // 미리보기에서 돌아올 때 기존 진입과 짝을 이루는 반대 방향 모션을 사용한다.
    const [createStepBack, setCreateStepBack] = useState(false);
    const goToCreateStep = (step) => {
        setCreateStepBack(step === 'details' && createStep === 'preview');
        setCreateStep(step);
    };
    const [{ advertisementSearch, advertisementStore, advertisementPage }, setAdListParams] = useQueryParamsState(AD_LIST_QUERY_DEFAULTS);
    const search = advertisementSearch;
    const debouncedSearch = useDebounce(search, 300);
    // 가게 필터는 공통 FilterToolbar를 사용한다.

    const storeFilter = advertisementStore;
    const filterStoreOptions = [
        { value: 'ALL', label: '전체 가게' },
        ...myStores.map(s => ({ value: String(s.id), label: s.name })),
    ];
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

    // 배너 수정은 새 광고 신청과 입력 항목이 달라 별도 모달 상태로 둔다.

    const [editTarget, setEditTarget] = useState(null);

    const { errors, validate, clearError, resetErrors } = useFormErrors();
    const {
        errors: editErrors,
        validate: validateEdit,
        clearError: clearEditError,
        resetErrors: resetEditErrors,
    } = useFormErrors();
    const [editBannerCopyKey, setEditBannerCopyKey] = useState('CUSTOM');
    const [editBannerTitle, setEditBannerTitle] = useState('');
    const [editBannerDescription, setEditBannerDescription] = useState('');
    const [editBannerMotionKey, setEditBannerMotionKey] = useState(DEFAULT_BANNER_MOTION_KEY);
    const [editImageFiles, setEditImageFiles] = useState([]);
    const selectedStore = myStores.find(store => store.id === storeId);
    const exposureDays = exposureDaysOf(dateRange);
    const dailyPrice = AD_DAILY_PRICE[adType] ?? 0;
    const estimatedAmount = Math.max(0, exposureDays) * dailyPrice;

    const releaseImagePreviewUrl = () => {
        revokeBlobUrl(imagePreviewUrlRef.current);
        imagePreviewUrlRef.current = '';
        setImagePreviewUrl('');
    };

    useEffect(() => () => {
        revokeBlobUrl(imagePreviewUrlRef.current);
    }, []);

    const { data, isLoading: loading, isFetching, isPlaceholderData, error: adsError, refetch } = useQuery({
        queryKey: adKeys.my({ page, size: PAGE_SIZE, storeFilter, search: debouncedSearch.trim() }),
        queryFn: () => fetchMyAds(page, storeFilter, debouncedSearch),
        placeholderData: keepPreviousData,
    });
    const ads = data?.ads ?? EMPTY_ADS;
    const totalElements = data?.totalElements ?? 0;
    const cancelMutation = useMutation({
        mutationFn: (adId) => adService.cancelAd(adId),
        onSuccess: () => message.success('취소 요청을 접수했어요. 환불 여부는 광고 내역에서 확인해주세요.'),
        onError: (err) => message.error(errorMessageOr(err, '결과를 확인하지 못했어요. 내역을 다시 확인해주세요.')),
        // 노출 중이던 광고를 취소하면 공개 배너·배지와 통계의 광고 요약도 바뀐다.
        onSettled: () => invalidateAdData(queryClient),
    });

    // 종료 광고는 소프트 삭제로 목록에서 숨긴다.

    const removeMutation = useMutation({
        mutationFn: (adId) => adService.removeAd(adId),
        onSuccess: () => {
            message.success('목록에서 삭제됐어요.');
            void queryClient.invalidateQueries({ queryKey: adKeys.my() });
        },
        onError: (err) => message.error(errorMessageOr(err, '삭제에 실패했어요.')),
    });

    // 새 사진을 선택하지 않으면 images를 보내지 않아 기존 사진을 유지한다.

    const updateMutation = useMutation({
        mutationFn: ({ adId, formData }) => adService.updateAd(adId, formData),
        onSuccess: () => {
            message.success('광고가 수정됐어요.');
            // 배너 문구·이미지는 공개 목록의 배너에도 보인다.
            void invalidateAdData(queryClient);
            setEditTarget(null);
            resetEditErrors();
        },
        onError: (err) => message.error(errorMessageOr(err, '수정에 실패했어요.')),
    });

    const handleBannerCopyChange = (key) => {
        setBannerCopyKey(key);
        const preset = getBannerCopyPreset(key);
        if (!preset) return;
        setBannerTitle(preset.title);
        setBannerDescription(preset.description);
        clearError('bannerTitle');
        clearError('bannerDescription');
    };

    const handleEditBannerCopyChange = (key) => {
        setEditBannerCopyKey(key);
        const preset = getBannerCopyPreset(key);
        if (!preset) return;
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
        message.error(`새로 올리는 이미지 전체 합계는 ${MAX_IMAGE_REQUEST_MB}MB 이하여야 해요.`);
        return false;
    };

    const handleImagesChange = ({ fileList }) => {
        const next = fileList.slice(0, MAX_BANNER_IMAGES);
        if (!withinImageRequestLimit(next)) return;
        setImageFiles(next);
        releaseImagePreviewUrl();
        const previewUrl = imagePreviewUrlFor(next[0]);
        imagePreviewUrlRef.current = previewUrl;
        setImagePreviewUrl(previewUrl);
        clearError('images');
    };

    const validateCreateForm = () => validate((e) => collectCreateErrors(e, {
        storeId, dateRange, adType, imageFiles, bannerTitle, bannerDescription,
    }));

    const handleShowPreview = () => {
        if (!validateCreateForm()) return;
        goToCreateStep('preview');
    };

    const handleSubmit = async () => {

        if (!validateCreateForm()) {
            goToCreateStep('details');
            return;
        }

        const formData = buildCreateFormData({
            storeId, adType, dateRange, bannerCopyKey, bannerTitle, bannerDescription, bannerMotionKey, imageFiles,
        });

        const result = await pay(formData);
        if (result.success) {
            setModalOpen(false);
            resetForm();
        }
    };

    const handlePay = (ad) => payExisting(ad.id);

    // 수정 모달에는 기존 텍스트와 사진 미리보기를 채운다.

    const handleEdit = (ad) => {
        setEditTarget(ad);
        setEditBannerCopyKey(findBannerCopyKey(ad) || 'CUSTOM');
        setEditBannerTitle(ad.title || DEFAULT_BANNER_COPY.title);
        setEditBannerDescription(ad.description || DEFAULT_BANNER_COPY.description);
        setEditBannerMotionKey(findBannerMotionKey(ad));
        resetEditErrors();
        setEditImageFiles(existingImageFiles(ad));
    };

    const handleEditImagesChange = ({ fileList }) => {
        const next = fileList.slice(0, MAX_BANNER_IMAGES);
        if (withinImageRequestLimit(next)) setEditImageFiles(next);
    };

    const handleUpdateSubmit = async () => {
        if (!editTarget) return;
        if (!validateEdit((e) => {
            if (!editBannerTitle.trim()) e.bannerTitle = '광고 제목을 입력해주세요.';
            if (!editBannerDescription.trim()) e.bannerDescription = '광고 내용을 입력해주세요.';
        })) return;

        const formData = buildUpdateFormData({
            editBannerCopyKey, editBannerTitle, editBannerDescription, editBannerMotionKey, editImageFiles,
        });

        await updateMutation.mutateAsync({ adId: editTarget.id, formData });
    };

    const visibleCount = totalElements;

    const handleCancel = (ad) => {
        confirm({
            ...cancelConfirmOptions(ad),
            onOk: () => cancelMutation.mutateAsync(ad.id),
        });
    };

    // 종료상태 광고를 목록에서 지우기 — 예약 쪽 handleRemove와 동일한 확인 문구 패턴
    const handleRemove = (ad) => {
        confirm({
            title: '광고 삭제',
            content: '이 광고를 목록에서 삭제해요. 결제/노출 이력은 삭제되지 않고 관리자 측에서만 보관돼요.',
            okText: '삭제', cancelText: '취소',
            okButtonProps: { danger: true }, centered: true,
            onOk: () => removeMutation.mutateAsync(ad.id),
        });
    };

    const columns = buildAdColumns({
        payingId, cancelMutation, removeMutation,
        onPay: handlePay, onEdit: handleEdit, onCancel: handleCancel, onRemove: handleRemove,
    });

    const adsContent = renderAdsContent({
        adsError, refetch, isFetching, loading: loading || search.trim() !== debouncedSearch.trim(), isPlaceholderData, totalElements, page, columns, ads,
        onPageChange: (nextPage) => setAdListParams({ advertisementPage: String(nextPage - 1) }),
    });

    const createChrome = createModalText(createStep);

    return (
        <div className="reserve-ad-manage-tab">
            <div className="reserve-ad-manage-heading">
                <Text className="reserve-ad-manage-intro" type="secondary" style={{ fontSize: fontSize.sm }}>
                    <SkeletonText loading={loading}>노출형(1,000원/일)은 가게 목록 상단에 카드·리스트로 우선 노출되고 작은 &quot;광고&quot; 표기가 붙어요. 배너형(5,000원/일)은 화면 우측 하단에 표시돼요.</SkeletonText>
                </Text>
            </div>

            <div className="reserve-ad-manage-primary-row">
                <Button variant="primary" size="sm" onClick={() => setModalOpen(true)} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                    새 광고 신청
                </Button>
                <div className="reserve-ad-manage-store-summary">
                    {storesLoading ? <span aria-hidden="true"><FilterMenuSkeleton select={{
                        value: storeFilter, options: filterStoreOptions, ariaLabel: '광고 가게 필터',
                    }} /></span> : <FilterMenu
                        appearance="plain"
                        value={storeFilter}
                        onChange={value => setAdListParams({ advertisementStore: value, advertisementPage: '0' })}
                        options={filterStoreOptions}
                        disabled={loading || storesLoading || Boolean(storesError) && !myStores.length}
                        loading={storesLoading}
                        aria-label="광고 가게 필터"
                    />}
                    {loading ? <span className="reserve-ad-manage-count" aria-hidden="true"><Bone width={40} height={16} /></span> : (
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
                initialLoading={loading}
            />

            {/*
             * 가게 선택 조회가 실패해도 광고 목록은 유지하고 필터 아래에 재시도를 표시한다.
             */}
            {storesError && (
                <DataState state="error" kind="store" subject="가게 필터 목록" error={storesError}
                    onRetry={refetchStores} retrying={storesLoading} compact style={{ marginBottom: 16 }} />
            )}

            {/*
             * 최초·쿼리 전환에는 골격을 표시하고 수동 갱신 중에는 기존 목록을 유지한다.
             */}
            {adsContent}

            {paymentDialog}
            <FormModal
                title={createChrome.title}
                open={modalOpen}
                navigationDirty={Boolean(storeId || dateRange || imageFiles.length || adType !== 'BADGE'
                    || bannerCopyKey !== DEFAULT_BANNER_COPY_KEY || bannerTitle !== DEFAULT_BANNER_COPY.title
                    || bannerDescription !== DEFAULT_BANNER_COPY.description || bannerMotionKey !== DEFAULT_BANNER_MOTION_KEY)}
                onClose={closeCreateModal}
                onSubmit={createStep === 'details' ? handleShowPreview : handleSubmit}
                onCancelAction={createStep === 'details' ? closeCreateModal : () => goToCreateStep('details')}
                submitting={paying}
                navigationAllowUnload={paying}
                width={createChrome.width}
                submitText={createChrome.submitText}
                cancelText={createChrome.cancelText}
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
                                        disabled={storesLoading || Boolean(storesError) && !myStores.length}
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
                                disabledDate={date => date.isBefore(dayjs(), 'day')}
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
                                        onChange={(event) => { setBannerTitle(event.target.value); setBannerCopyKey('CUSTOM'); clearError('bannerTitle'); }}
                                        maxLength={BANNER_TITLE_MAX_LENGTH}
                                        showCount
                                    />
                                </FormField>
                                <FormField label="내용" error={errors.bannerDescription}>
                                    <FormTextArea
                                        aria-label="광고 내용"
                                        rows={2}
                                        value={bannerDescription}
                                        onChange={(event) => { setBannerDescription(event.target.value); setBannerCopyKey('CUSTOM'); clearError('bannerDescription'); }}
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
                                    <LoadingUpload
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
                                    </LoadingUpload>
                                </FormField>
                                {previewNode}
                            </>
                        )}
                    </div>
                ) : (
                    <div key="ad-preview" className="reserve-ad-create-page reserve-ad-create-page--preview">
                        {dateRange?.[0] && dateRange?.[1] && <AdCreationPreview
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
                        />}
                    </div>
                )}
            </FormModal>

            {/* 가게/유형/기간은 결제 금액과 연결되므로 문구 프리셋과 대표 이미지만 수정한다. */}
            <FormModal
                title={editTarget ? `배너 광고 수정 — ${editTarget.storeName}` : '배너 광고 수정'}
                open={!!editTarget}
                navigationDirty={Boolean(editTarget && (editBannerTitle !== (editTarget.title || DEFAULT_BANNER_COPY.title)
                    || editBannerDescription !== (editTarget.description || DEFAULT_BANNER_COPY.description) || editBannerMotionKey !== findBannerMotionKey(editTarget)
                    || editBannerCopyKey !== (findBannerCopyKey(editTarget) || 'CUSTOM') || editImageFiles.some(file => Boolean(file.originFileObj))
                    || editImageFiles.map(file => file.url).join(',') !== existingImageFiles(editTarget).map(file => file.url).join(',')))}
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
                        onChange={(event) => { setEditBannerTitle(event.target.value); setEditBannerCopyKey('CUSTOM'); clearEditError('bannerTitle'); }}
                        maxLength={BANNER_TITLE_MAX_LENGTH}
                        showCount
                    />
                </FormField>
                <FormField label="내용" error={editErrors.bannerDescription}>
                    <FormTextArea
                        aria-label="광고 내용"
                        rows={2}
                        value={editBannerDescription}
                        onChange={(event) => { setEditBannerDescription(event.target.value); setEditBannerCopyKey('CUSTOM'); clearEditError('bannerDescription'); }}
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
                    <LoadingUpload
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
                    </LoadingUpload>
                </FormField>
                {previewNode}
            </FormModal>
        </div>
    );
};

export default AdManageTab;
