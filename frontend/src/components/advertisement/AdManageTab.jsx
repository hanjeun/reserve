import React, { useEffect, useState } from 'react';
import { Typography, Table, Tag, Upload, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Button, FormModal, FormField, FormInput, FormTextArea, FormSelect, FormDatePicker, SegmentedControl } from '../common';
import { useAdPayment, useMessage, useImagePreview } from '../../hooks';
import adService from '../../services/adService';
import storeService from '../../services/storeService';
import { fontSize } from '../../styles/tokens';

const { Text } = Typography;

const AD_TYPE_OPTIONS = [
    { value: 'BADGE', label: '배지형 (1,000원/일)' },
    { value: 'BANNER', label: '배너형 (5,000원/일)' },
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

// 취소 가능한 상태 — 결제 전(돈 안 나감)이거나 이미 결제된 노출 중(전액 환불)만
const CANCELLABLE_STATUSES = ['PENDING_PAYMENT', 'ACTIVE'];

// 배너 이미지 최대 장수 — 가게 상세 이미지(최대 5장)와 동일하게 통일
const MAX_BANNER_IMAGES = 5;

/**
 * 사업자 광고 관리 탭 — 내 광고 목록 + 새 광고 신청(결제).
 * 가격: BADGE 1,000원/일, BANNER 5,000원/일 (예시값, 추후 조정 가능)
 */
const AdManageTab = () => {
    const { message, confirm } = useMessage();
    const { pay, paying } = useAdPayment();
    const { handlePreview, PreviewModal } = useImagePreview();
    const [ads, setAds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [myStores, setMyStores] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);

    const [storeId, setStoreId] = useState(undefined);
    const [adType, setAdType] = useState('BADGE');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dateRange, setDateRange] = useState(null);
    // 가게 등록 폼(StoreImages)과 동일한 picture-card fileList 패턴 — 여러 장 지원
    const [imageFiles, setImageFiles] = useState([]);

    const refetch = () => {
        setLoading(true);
        adService.getMyAds()
            .then((list) => setAds(Array.isArray(list) ? list : []))
            .catch(() => message.error('광고 목록을 불러오지 못했습니다.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        refetch(); // eslint-disable-line react-hooks/set-state-in-effect
        storeService.getMyStores()
            .then((list) => setMyStores(Array.isArray(list) ? list : []))
            .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const resetForm = () => {
        setStoreId(undefined);
        setAdType('BADGE');
        setTitle('');
        setDescription('');
        setDateRange(null);
        setImageFiles([]);
    };

    const handleImagesChange = ({ fileList }) => setImageFiles(fileList.slice(0, MAX_BANNER_IMAGES));

    const handleSubmit = async () => {
        if (!storeId) { message.warning('가게를 선택해주세요.'); return; }
        if (!dateRange) { message.warning('노출 기간을 선택해주세요.'); return; }
        if (adType === 'BANNER' && (imageFiles.length === 0 || !title.trim())) {
            message.warning('배너 광고는 이미지(최소 1장)와 제목이 필수입니다.');
            return;
        }

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
            refetch();
        }
    };

    const handleCancel = (ad) => {
        const isPaid = ad.status === 'ACTIVE';
        confirm({
            title: '광고 취소',
            content: isPaid
                ? `결제된 ${ad.amount?.toLocaleString()}원이 전액 환불됩니다. 즉시 노출이 중단되며 되돌릴 수 없습니다.`
                : '아직 결제되지 않은 신청입니다. 목록에서 바로 삭제됩니다.',
            okText: isPaid ? '환불하기' : '취소하기', cancelText: '닫기',
            okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                try {
                    await adService.cancelAd(ad.id);
                    message.success(isPaid ? '환불 처리되었습니다.' : '광고가 취소되었습니다.');
                    refetch();
                } catch {
                    message.error('취소에 실패했습니다.');
                }
            },
        });
    };

    const columns = [
        { title: '가게', dataIndex: 'storeName', key: 'storeName' },
        {
            title: '유형', dataIndex: 'adType', key: 'adType',
            render: (v) => (v === 'BADGE' ? '배지형' : '배너형'),
        },
        { title: '기간', key: 'period', render: (_, r) => `${r.startDate} ~ ${r.endDate}` },
        { title: '금액', dataIndex: 'amount', key: 'amount', render: (v) => `${v?.toLocaleString()}원` },
        {
            title: '상태', dataIndex: 'status', key: 'status',
            render: (v) => <Tag color={STATUS_LABELS[v]?.color}>{STATUS_LABELS[v]?.label || v}</Tag>,
        },
        {
            title: '', key: 'actions',
            render: (_, r) => CANCELLABLE_STATUSES.includes(r.status) ? (
                <Button variant="ghost-sm-danger" onClick={() => handleCancel(r)}>
                    {r.status === 'ACTIVE' ? '환불' : '취소'}
                </Button>
            ) : null,
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

            {ads.length === 0 && !loading ? (
                <Empty description="신청한 광고가 없습니다." />
            ) : (
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={ads}
                    loading={loading}
                    pagination={false}
                    size="small"
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
                <FormField label="가게">
                    <FormSelect
                        placeholder="가게 선택"
                        value={storeId}
                        onChange={setStoreId}
                        options={myStores.map((s) => ({ value: s.id, label: s.name }))}
                    />
                </FormField>
                <FormField label="광고 유형">
                    <SegmentedControl
                        value={adType}
                        onChange={setAdType}
                        options={AD_TYPE_OPTIONS}
                    />
                </FormField>
                <FormField label="노출 기간">
                    <FormDatePicker.RangePicker
                        value={dateRange}
                        onChange={setDateRange}
                    />
                </FormField>
                {adType === 'BANNER' && (
                    <>
                        <FormField label="배너 제목">
                            <FormInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 여름맞이 20% 할인" maxLength={40} />
                        </FormField>
                        <FormField label="배너 설명 (선택)">
                            <FormTextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={100} />
                        </FormField>
                        <FormField label={`배너 이미지 (최대 ${MAX_BANNER_IMAGES}장, 여러 장이면 배너에서 자동으로 넘어가요)`}>
                            <Upload
                                listType="picture-card"
                                accept="image/*"
                                fileList={imageFiles}
                                onChange={handleImagesChange}
                                onPreview={handlePreview}
                                beforeUpload={() => false}
                                maxCount={MAX_BANNER_IMAGES}
                                multiple
                            >
                                {imageFiles.length < MAX_BANNER_IMAGES && (
                                    <div>
                                        <PlusOutlined />
                                        <div style={{ marginTop: 8 }}>업로드</div>
                                    </div>
                                )}
                            </Upload>
                        </FormField>
                        <PreviewModal />
                    </>
                )}
            </FormModal>
        </div>
    );
};

export default AdManageTab;
