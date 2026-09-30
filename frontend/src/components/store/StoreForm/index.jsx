import React from 'react';
import { Form, Typography } from 'antd';
import { PageContainer } from '../../common';
import { fontWeight, fontSize } from '../../../styles/tokens';
import { useWindowWidth } from '../../../hooks';
import { STORE_FORM_COPY, STORE_FORM_DENSITY_VARS, storeFormFrame } from '../storeFormFrame';
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
    // 폭·여백·제목 간격은 로딩 뼈대(StoreFormSkeleton)와 같은 관문(storeFormFrame)에서 받는다.
    const { isSingleColumn, container, headingGap } = storeFormFrame(useWindowWidth());
    const { title, subtitle } = STORE_FORM_COPY[mode === 'create' ? 'create' : 'edit'];

    return (
        <PageContainer
            className="reserve-store-form-page"
            {...container}
            style={STORE_FORM_DENSITY_VARS}
        >
            {/* MyStores 스타일과 동일하게 통일 */}
            <div className="reserve-store-form-heading" style={{ marginBottom: headingGap }}>
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
                    imageAutoplayEnabled: true,
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
    // 모바일 밀도 변수(STORE_FORM_DENSITY_VARS)는 storeFormFrame 으로 옮겼다 — 범용 Core 입력(54px)은 그대로 보존한다.
    title: {
        fontWeight: fontWeight.extrabold,
        margin: '0 0 8px',
    },
};

export default StoreForm;
