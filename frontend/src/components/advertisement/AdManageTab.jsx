import React, { useState, useMemo, useEffect } from 'react';
import { Typography, Tag, Upload } from 'antd';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { PlusOutlined, CreditCardOutlined, CloseOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, FormModal, FormField, FormInput, FormTextArea, FormSelect, FormDatePicker, SegmentedControl, AdminTableSkeleton, DataTable, FilterToolbar } from '../common';
import { useAdPayment, useMessage, useImagePreview, useMyStores, useFormErrors } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adKeys } from '../../hooks/queryKeys';
import adService from '../../services/adService';
import { getDetailImageUrl } from '../../utils/image';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

// 가격은 바로 위 안내 문구에서 이미 안내되므로, 가게 선택과 한 줄에 놓을 때 좋게 짧게 유지
const AD_TYPE_OPTIONS = [
    { value: 'BADGE', label: '배지형' },
    { value: 'BANNER', label: '배너형' },
];

const STATUS_LABELS = {
    PENDING_PAYMENT: { label: '결제 대기', color: 'default' },
    PAYMENT_FAILED:  { label: '결제 실패', color: 'error' },
    ACTIVE:          { label: '노출 중',   color: 'success' },
    EXPIRED:         { label: '만료됨',    color: 'default' },
    SUSPENDED:       { label: '중단됨',    color: 'error' },
    CANCELLED:       { label: '취소됨',    color: 'default' },
    REFUNDED:        { label: '환불됨',    color: 'default' },
};

// 결제 가능한 상태 — 아직 결제 전(대기)이거나 결제가 실패한 경우
const PAYABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED']);

// 취소 가능한 상태 — 결제 전(돈 안 나감) 또는 결제 실패(돈 안 나감)이거나 이미 결제된 노출 중(전액 환불)만
const CANCELLABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED', 'ACTIVE']);

// 수정 가능한 상태 — 백엔드 updateAd와 동일한 규칙(CANCELLED/EXPIRED/SUSPENDED/REFUNDED는 수정 불가)
const EDITABLE_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED', 'ACTIVE']);

// 종료상태(만료/취소/환불/중단) — 목록에서 직접 숨길 수 있는 상태(소프트삭제) — 2026-07 추가,
// 백엔드 AdvertisementService.removeAd와 동일한 규칙
const REMOVABLE_STATUSES = new Set(['EXPIRED', 'CANCELLED', 'REFUNDED', 'SUSPENDED']);

// 배너 이미지 최대 장수 — 가게 상세 이미지(최대 5장)와 동일하게 통일
const MAX_BANNER_IMAGES = 5;

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 값을 유지 (2026-07 전수조사)
// 예전엔 cols/headers를 아예 안 넘겨서 기본값 6칸 + 헤더까지 회색 막대로 그려졌다.
const SKELETON_HEADERS = ['가게', '유형', '기간', '금액', '상태', '처리'];
const SKELETON_COLS    = [220, 90, 190, 100, 100, 220];

// 2026-07 추가 — MembersTab/StoresAdminTab과 동일한 이유: 고정값(3행)으로 두면 실제 데이터(예:
// 8건)와 안 맞아 로딩이 끝나는 순간 목록이 갑자기 늘어나 보였다. 이 탭은 페이지네이션이 없어(전체를
// 한 번에 보여줌) pageSize 개념은 없지만, 원리는 동일하다 — keepPreviousData 덕에 refetch
// 중에는 이전 개수가 그대로 남아있어 정확히 맞는 행 수를 그릴 수 있고, 콜드스타트(개수 미지)만
// 8로 폴백한다(다른 탭들의 폴백값과 동일).
const skeletonRowCount = (total) => (total ? total : 8);

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
    const { stores: myStores } = useMyStores();
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();
    const [modalOpen, setModalOpen] = useState(false);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    // 2026-07 추가 — ReservationTab과 동일한 가게 필터 컨벤션(FilterToolbar selects,
    // 가게 2개 이상일 때만 노출, "전체 가게" 옵션 포함)
    const [storeFilter, setStoreFilter] = useState('ALL');

    const [storeId, setStoreId] = useState(undefined);
    const [adType, setAdType] = useState('BADGE');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dateRange, setDateRange] = useState(null);
    // 가게 등록 폼(StoreImages)과 동일한 picture-card fileList 패턴 — 여러 장 지원
    const [imageFiles, setImageFiles] = useState([]);

    // 2026-07 추가 — 배너 광고 수정용 별도 모달 state. 새 신청 모달과 달리 가게/유형/기간이 없어서
    // 그 모달을 그대로 재사용하기 애매해 별도로 둔다. editTarget이 null이면 닫힌 상태.
    const [editTarget, setEditTarget] = useState(null);

    // 신청 모달과 수정 모달이 각각 자기 오류를 든다. 하나로 합치면 한쪽 모달을 닫을 때
    // 다른 쪽 빨간 글씨까지 지워지고, 필드명(title)이 겹쳐 엉뚱한 칸에 에러가 붙는다.
    const { errors, validate, clearError, resetErrors } = useFormErrors();
    const { errors: editErrors, validate: editValidate,
            clearError: clearEditError, resetErrors: resetEditErrors } = useFormErrors();
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editImageFiles, setEditImageFiles] = useState([]);

    const { data: ads = [], isLoading: loading, isFetching, error: adsError, refetch } = useQuery({
        queryKey: adKeys.my(),
        queryFn: () => adService.getMyAds(),
        select: (list) => (Array.isArray(list) ? list : []),
        placeholderData: keepPreviousData,
    });
    useEffect(() => {
        if (adsError) message.error('광고 목록을 불러오지 못했습니다.');
    }, [adsError, message]);

    const cancelMutation = useMutation({
        mutationFn: (adId) => adService.cancelAd(adId),
        onSuccess: (_, adId) => {
            const cancelled = ads.find((a) => a.id === adId);
            message.success(cancelled?.status === 'ACTIVE' ? '환불 처리되었습니다.' : '광고가 취소되었습니다.');
            queryClient.invalidateQueries({ queryKey: adKeys.my() });
        },
        onError: () => message.error('취소에 실패했습니다.'),
    });

    // 종료상태 광고 목록에서 숨기기(소프트삭제) — 2026-07 추가, 예약 쪽 "삭제"와 동일한 패턴
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
            queryClient.invalidateQueries({ queryKey: adKeys.my() });
            setEditTarget(null);
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '수정에 실패했습니다.'),
    });

    const resetForm = () => {
        setStoreId(undefined);
        setAdType('BADGE');
        setTitle('');
        setDescription('');
        setDateRange(null);
        setImageFiles([]);
        // 모달을 닫았다 다시 열었을 때 지난 오류가 남아 있으면 안 된다.
        resetErrors();
    };

    const handleImagesChange = ({ fileList }) => {
        setImageFiles(fileList.slice(0, MAX_BANNER_IMAGES));
        clearError('images');
    };

    const handleSubmit = async () => {
        // 틀린 칸을 한 번에 모아 각 칸 아래에 붙인다.
        // 예전엔 message.warning 을 세 번 이어 붙여서 ① 첫 오류만 알려주고(고치면 다음 게 또 뜬다)
        // ② 토스트가 사라지면 어느 칸이 문제였는지 알 수 없었다.
        // 배너 필수 조건은 원래 한 덩어리(이미지+제목)로 묶여 있었는데, 실제로 비어 있는 건
        // 둘 중 하나일 수 있으므로 칸별로 갈라서 표시한다.
        if (!validate((e) => {
            if (!storeId) e.storeId = '가게를 선택해주세요.';
            if (!dateRange) e.dateRange = '노출 기간을 선택해주세요.';
            if (adType === 'BANNER') {
                if (imageFiles.length === 0) e.images = '배너 광고는 이미지가 최소 1장 필요합니다.';
                if (!title.trim()) e.title = '배너 제목을 입력해주세요.';
            }
        })) return;

        const formData = new FormData();
        formData.append('storeId', storeId);
        formData.append('adType', adType);
        formData.append('startDate', dateRange[0].format('YYYY-MM-DD'));
        formData.append('endDate', dateRange[1].format('YYYY-MM-DD'));
        if (title) formData.append('title', title);
        if (description) formData.append('description', description);
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
        resetEditErrors();
        setEditTarget(ad);
        setEditTitle(ad.title || '');
        setEditDescription(ad.description || '');
        setEditImageFiles((ad.imageUrls || []).map((url, i) => ({
            uid: `existing-${i}`,
            name: `image-${i + 1}`,
            status: 'done',
            url: getDetailImageUrl(url),
        })));
    };

    const handleEditImagesChange = ({ fileList }) => setEditImageFiles(fileList.slice(0, MAX_BANNER_IMAGES));

    const handleUpdateSubmit = async () => {
        if (!editValidate((e) => {
            if (!editTitle.trim()) e.editTitle = '배너 제목을 입력해주세요.';
        })) return;

        const formData = new FormData();
        formData.append('title', editTitle);
        formData.append('description', editDescription);
        // 사용자가 새로 고른 파일(originFileObj 있음)만 보낸다 — 기존 이미지(url만 있고 originFileObj 없음)만
        // 있고 새로 고른 파일이 하나도 없으면 images 자체를 안 보내서 백엔드가 기존 이미지를 유지하게 한다.
        const newFiles = editImageFiles.filter((f) => f.originFileObj);
        newFiles.forEach((f) => formData.append('images', f.originFileObj));

        await updateMutation.mutateAsync({ adId: editTarget.id, formData });
    };

    const filteredAds = useMemo(() => {
        let list = storeFilter !== 'ALL'
            ? ads.filter((a) => String(a.storeId) === storeFilter)
            : ads;
        if (debouncedSearch.trim()) {
            const kw = debouncedSearch.toLowerCase();
            list = list.filter((a) => a.storeName?.toLowerCase().includes(kw));
        }
        return list;
    }, [ads, storeFilter, debouncedSearch]);

    const handleCancel = (ad) => {
        const isPaid = ad.status === 'ACTIVE';
        confirm({
            title: '광고 취소',
            content: isPaid
                ? `결제된 ${ad.amount?.toLocaleString()}원이 전액 환불됩니다. 즉시 노출이 중단되며 되돌릴 수 없습니다.`
                : '아직 결제되지 않은 신청입니다. 목록에서 바로 삭제됩니다.',
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
            render: (v) => (v === 'BADGE' ? '배지형' : '배너형'),
        },
        { title: '기간', key: 'period', width: 190, render: (_, r) => `${r.startDate} ~ ${r.endDate}` },
        { title: '금액', dataIndex: 'amount', key: 'amount', width: 100, render: (v) => `${v?.toLocaleString()}원` },
        {
            title: '상태', dataIndex: 'status', key: 'status', width: 100,
            render: (v) => <Tag color={STATUS_LABELS[v]?.color}>{STATUS_LABELS[v]?.label || v}</Tag>,
        },
        {
            title: '처리', key: 'actions', width: 220,
            render: (_, r) => (
                <div style={{ display: 'flex', gap: 8 }}>
                    {PAYABLE_STATUSES.has(r.status) && (
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
                        <Button variant="ghost-sm-danger" onClick={() => handleCancel(r)}>
                            <CloseOutlined /> {r.status === 'ACTIVE' ? '환불' : '취소'}
                        </Button>
                    )}
                    {REMOVABLE_STATUSES.has(r.status) && (
                        <Button variant="ghost-sm" onClick={() => handleRemove(r)} style={{ color: colors.text.tertiary }}>
                            <DeleteOutlined /> 삭제
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: fontSize.sm, flex: '1 1 260px', minWidth: 0 }}>
                    배지형(1,000원/일)은 가게 목록에 &quot;광고&quot; 배지로, 배너형(5,000원/일)은 화면 우측 하단 배너로 노출돼요.
                </Text>
                <Button variant="primary" size="sm" onClick={() => setModalOpen(true)} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <PlusOutlined /> 새 광고 신청
                </Button>
            </div>

            <FilterToolbar
                selects={[
                    {
                        value: storeFilter,
                        onChange: setStoreFilter,
                        width: 140,
                        disabled: loading,
                        options: [
                            { value: 'ALL', label: '전체 가게' },
                            ...myStores.map(s => ({ value: String(s.id), label: s.name }))
                        ],
                    },
                ]}
                count={filteredAds.length}
                search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: '가게명으로 검색' }}
                onReload={refetch}
                loading={loading || isFetching}
            />

            {/* 로딩 조건 통일(2026-07 전수조사): 예전엔 ads.length === 0 조건 때문에 새로고침이나
                광고 신청/취소 후 재조회 시엔 아무 로딩 신호도 없었다 — 관리자 탭들과 동일하게 통일. */}
            {(loading || isFetching) ? (
                <AdminTableSkeleton rows={skeletonRowCount(filteredAds.length)} cols={SKELETON_COLS} headers={SKELETON_HEADERS} actionBtns={2} />
            ) : (
                <DataTable
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredAds}
                    pagination={false}
                    locale={{ emptyText: '신청한 광고가 없습니다.' }}
                />
            )}

            <FormModal
                title="새 광고 신청"
                open={modalOpen}
                onClose={() => { setModalOpen(false); resetForm(); }}
                onSubmit={handleSubmit}
                submitting={paying}
                submitText="결제하고 신청하기"
            >
                <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <FormField label="가게" error={errors.storeId}>
                            <FormSelect
                                placeholder="가게 선택"
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
                                onChange={setAdType}
                                options={AD_TYPE_OPTIONS}
                            />
                        </FormField>
                    </div>
                </div>
                <FormField label="노출 기간" error={errors.dateRange}>
                    <FormDatePicker.RangePicker
                        value={dateRange}
                        onChange={(v) => { setDateRange(v); clearError('dateRange'); }}
                    />
                </FormField>
                {adType === 'BANNER' && (
                    <>
                        <FormField label="배너 제목" error={errors.title}>
                            <FormInput value={title} onChange={(e) => { setTitle(e.target.value); clearError('title'); }} placeholder="예) 여름맞이 20% 할인" maxLength={40} showCount />
                        </FormField>
                        <FormField label="배너 설명 (선택)">
                            <FormTextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={100} showCount />
                        </FormField>
                        <FormField label={`배너 이미지 (최대 ${MAX_BANNER_IMAGES}장, 여러 장이면 배너에서 자동으로 넘어가요)`} error={errors.images}>
                            {/* 2026-07 추가(수정): 처음엔 2:1로 고정 크롭하는 방식이었는데, 원본 이미지가 잘리지 않았으면
                                하는 요청으로 AdBanner가 첫 이미지의 실제 비율을 그대로 따르도록 바뀌었다(더 이상 잘리지 않음).
                                그래도 가로형(가로가 긴) 이미지가 위젯과 가장 잘 어울린다는 안내는 남겨둔다(극단적으로 세로가 긴
                                사진을 올리면 위젯 자체가 아래로 길어지게 된다). */}
                            <Text type="secondary" style={{ fontSize: fontSize.xs, display: 'block', marginBottom: 8 }}>
                                원본 비율 그대로 노출돼요(잘리지 않음) — 가로가 긴 이미지(권장 2:1, 예: 800×400px)가 위젯과 가장 잘 어울려요.
                            </Text>
                            <Upload
                                listType="picture-card"
                                accept="image/*"
                                fileList={imageFiles}
                                onChange={handleImagesChange}
                                onPreview={(file) => handlePreview(file, imageFiles)}
                                beforeUpload={() => false}
                                maxCount={MAX_BANNER_IMAGES}
                                multiple
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
            </FormModal>

            {/* 2026-07 추가 — 배너 광고 수정 모달. 새 신청 모달과 달리 가게/유형/기간 선택이 없고
                제목/설명/이미지만 있다 — 백엔드 updateAd와 1:1로 대응. */}
            <FormModal
                title={editTarget ? `배너 광고 수정 — ${editTarget.storeName}` : '배너 광고 수정'}
                open={!!editTarget}
                onClose={() => setEditTarget(null)}
                onSubmit={handleUpdateSubmit}
                submitting={updateMutation.isPending}
                submitText="저장"
            >
                <FormField label="배너 제목" error={editErrors.editTitle}>
                    <FormInput value={editTitle} onChange={(e) => { setEditTitle(e.target.value); clearEditError('editTitle'); }} placeholder="예) 여름맞이 20% 할인" maxLength={40} showCount />
                </FormField>
                <FormField label="배너 설명 (선택)">
                    <FormTextArea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} maxLength={100} showCount />
                </FormField>
                <FormField label={`배너 이미지 (최대 ${MAX_BANNER_IMAGES}장)`}>
                    <Text type="secondary" style={{ fontSize: fontSize.xs, display: 'block', marginBottom: 8 }}>
                        새 이미지를 고르지 않으면 기존 이미지가 그대로 유지돼요 — 고치려면 전체를 새로 올려주세요(부분 교체는 지원하지 않아요).
                    </Text>
                    <Upload
                        listType="picture-card"
                        accept="image/*"
                        fileList={editImageFiles}
                        onChange={handleEditImagesChange}
                        onPreview={(file) => handlePreview(file, editImageFiles)}
                        beforeUpload={() => false}
                        maxCount={MAX_BANNER_IMAGES}
                        multiple
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
