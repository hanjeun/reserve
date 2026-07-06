import React, { useEffect, useState } from 'react';
import { Typography, Table, Tag, Upload, DatePicker, Radio, Empty } from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, FormModal, FormField, FormInput, FormTextArea, FormSelect } from '../common';
import { useAdPayment, useMessage } from '../../hooks';
import adService from '../../services/adService';
import storeService from '../../services/storeService';
import { fontSize } from '../../styles/tokens';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_LABELS = {
    PENDING_PAYMENT: { label: '결제 대기', color: 'default' },
    PAYMENT_FAILED:  { label: '결제 실패', color: 'error' },
    ACTIVE:          { label: '노출 중',   color: 'success' },
    EXPIRED:         { label: '만료됨',    color: 'default' },
    SUSPENDED:       { label: '중단됨',    color: 'error' },
};

/**
 * 사업자 광고 관리 탭 — 내 광고 목록 + 새 광고 신청(결제).
 * 가격: BADGE 1,000원/일, BANNER 5,000원/일 (예시값, 추후 조정 가능)
 */
const AdManageTab = () => {
    const { message } = useMessage();
    const { pay, paying } = useAdPayment();
    const [ads, setAds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [myStores, setMyStores] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);

    const [storeId, setStoreId] = useState(undefined);
    const [adType, setAdType] = useState('BADGE');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dateRange, setDateRange] = useState(null);
    const [imageFile, setImageFile] = useState(null);

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
        setImageFile(null);
    };

    const handleSubmit = async () => {
        if (!storeId) { message.warning('가게를 선택해주세요.'); return; }
        if (!dateRange) { message.warning('노출 기간을 선택해주세요.'); return; }
        if (adType === 'BANNER' && (!imageFile || !title.trim())) {
            message.warning('배너 광고는 이미지와 제목이 필수입니다.');
            return;
        }

        const formData = new FormData();
        formData.append('storeId', storeId);
        formData.append('adType', adType);
        formData.append('startDate', dateRange[0].format('YYYY-MM-DD'));
        formData.append('endDate', dateRange[1].format('YYYY-MM-DD'));
        if (title) formData.append('title', title);
        if (description) formData.append('description', description);
        if (imageFile) formData.append('image', imageFile);

        const result = await pay(formData);
        if (result.success) {
            setModalOpen(false);
            resetForm();
            refetch();
        }
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
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                    배지형(1,000원/일)은 가게 목록에 &quot;광고&quot; 배지로, 배너형(5,000원/일)은 화면 우측 하단 배너로 노출돼요.
                </Text>
                <Button variant="primary" onClick={() => setModalOpen(true)}>
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
                    <Radio.Group value={adType} onChange={(e) => setAdType(e.target.value)}>
                        <Radio.Button value="BADGE">배지형 (1,000원/일)</Radio.Button>
                        <Radio.Button value="BANNER">배너형 (5,000원/일)</Radio.Button>
                    </Radio.Group>
                </FormField>
                <FormField label="노출 기간">
                    <RangePicker
                        style={{ width: '100%' }}
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
                        <FormField label="배너 이미지">
                            <Upload
                                accept="image/*"
                                maxCount={1}
                                beforeUpload={(file) => { setImageFile(file); return false; }}
                                onRemove={() => setImageFile(null)}
                            >
                                <Button variant="secondary"><UploadOutlined /> 이미지 선택</Button>
                            </Upload>
                        </FormField>
                    </>
                )}
            </FormModal>
        </div>
    );
};

export default AdManageTab;
