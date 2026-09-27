import React from 'react';
import { Form, Typography } from 'antd';
import { PageContainer } from '../../common';
import { fontWeight, fontSize, heights, radius, spacing } from '../../../styles/tokens';
import { useWindowWidth } from '../../../hooks';
import { SCROLL_TO_FIRST_ERROR } from '../../../utils/form';
import StoreBasicInfo from './StoreBasicInfo';
import StoreImages from './StoreImages';
import StoreFormActions from './StoreFormActions';

const { Title, Text } = Typography;

const StoreForm = ({
    mode = 'create',
    form,
    onSubmit,
    loading = false,
    mainImage = [],
    detailImages = [],
    onMainImageChange,
    onDetailImagesChange,
    onPreview,
    onPreviewClickCapture,
    onValuesChange,
    onSaveDraft,
    draftState,
    formRef,
    initialValues: externalInitialValues,
}) => {
    const width = useWindowWidth();
    const isMobile = width < 768;
    // 768~899px에서 두 주요 컬럼 안에 시간 범위 두 칸을 다시 쪼개면 입력 폭이 부족하다.
    const isSingleColumn = width < 900;
    const title     = mode === 'create' ? '가게 등록' : '가게 정보 수정';
    const subtitle  = mode === 'create'
        ? '가게 정보를 입력하고 예약을 받아보세요.'
        : '등록된 가게 정보를 수정합니다.';
    let container = 'lg';
    if (isMobile) container = 'sm';
    else if (isSingleColumn) container = 'md';

    return (
        <PageContainer
            className="reserve-store-form-page"
            size={container}
            paddingTop={isMobile ? spacing[6] : spacing[10]}
            paddingX={isMobile ? spacing[5] : spacing[7]}
            paddingBottom={isMobile ? spacing[9] : spacing[12]}
            style={styles.mobileProperties}
        >
            {/* MyStores 스타일과 동일하게 통일 */}
            <div className="reserve-store-form-heading" style={{ marginBottom: isMobile ? spacing[6] : spacing[10] }}>
                <Title level={2} style={styles.title}>{title}</Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>{subtitle}</Text>
            </div>

            <Form
                className="reserve-store-form"
                ref={formRef}
                form={form}
                onFinish={onSubmit}
                onValuesChange={onValuesChange}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}
                layout="vertical"
                size="large"
                validateTrigger="onBlur"
                requiredMark={false}
                scrollToFirstError={SCROLL_TO_FIRST_ERROR}
                initialValues={mode === 'create' ? {
                    serviceDomain: undefined,
                    autoApprovalEnabled: false,
                    allowLatePayment: false,
                    allowDuplicateReservation: false,
                    emailNotificationEnabled: true,
                    noShowDeposit: 0,
                } : (externalInitialValues ?? {})}
            >
                <StoreBasicInfo isMobile={isSingleColumn} form={form}
                    zipCode={externalInitialValues?.zipCode || ''}
                    addressDetail={externalInitialValues?.addressDetail || ''}
                />
                <StoreImages
                    mainImage={mainImage}
                    detailImages={detailImages}
                    onMainImageChange={onMainImageChange}
                    onDetailImagesChange={onDetailImagesChange}
                    onPreview={onPreview}
                    onPreviewClickCapture={onPreviewClickCapture}
                    mainImageRequired={mode === 'create'}
                />
                <StoreFormActions
                    mode={mode}
                    loading={loading}
                    onSaveDraft={onSaveDraft}
                    draftState={draftState}
                />
            </Form>
        </PageContainer>
    );
};

// MyStores와 동일한 스타일 — fontSize 직접 지정 없이 level={2} 기본값 사용
const styles = {
    // RESERVE 작업 폼의 모바일 밀도만 바꾼다. 범용 Core 입력(54px)은 그대로 보존한다.
    mobileProperties: {
        '--reserve-store-form-control-height': heights.buttonMd,
        '--reserve-store-form-control-radius': radius.md,
        '--reserve-store-form-field-gap': spacing[4],
        '--reserve-store-form-label-gap': spacing[3],
    },
    title: {
        fontWeight: fontWeight.extrabold,
        margin: '0 0 8px',
    },
};

export default StoreForm;
