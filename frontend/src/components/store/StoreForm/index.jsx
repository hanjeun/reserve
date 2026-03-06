import React from 'react';
import { Form, Typography } from 'antd';
import { PageContainer } from '../../common';
import { fontWeight, fontSize } from '../../../styles/tokens';
import StoreBasicInfo from './StoreBasicInfo';
import StoreImages from './StoreImages';
import StoreFormActions from './StoreFormActions';

const { Title, Text } = Typography;

const BREAKPOINT = 768;

const useIsMobile = () => {
    const [isMobile, setIsMobile] = React.useState(
        typeof window !== 'undefined' ? window.innerWidth < BREAKPOINT : true
    );
    React.useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < BREAKPOINT);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    return isMobile;
};

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
    onCancel,
    formRef,
}) => {
    const isMobile  = useIsMobile();
    const title     = mode === 'create' ? '가게 등록' : '가게 정보 수정';
    const subtitle  = mode === 'create'
        ? '가게 정보를 입력하고 예약을 받아보세요.'
        : '등록된 가게 정보를 수정합니다.';
    const container = isMobile ? 'sm' : 'lg';

    return (
        <PageContainer size={container} paddingTop={isMobile ? '32px' : '48px'}>
            {/* MyStores 스타일과 동일하게 통일 */}
            <div style={{ marginBottom: isMobile ? 32 : 48 }}>
                <Title level={2} style={styles.title}>{title}</Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>{subtitle}</Text>
            </div>

            <Form
                ref={formRef}
                form={form}
                onFinish={onSubmit}
                layout="vertical"
                size="large"
                requiredMark={false}
                initialValues={mode === 'create' ? {
                    autoApprovalEnabled: false,
                    allowLatePayment: false,
                    allowDuplicateReservation: false,
                    noShowDeposit: 0,
                } : {}}
            >
                <StoreBasicInfo isMobile={isMobile} />
                <StoreImages
                    mainImage={mainImage}
                    detailImages={detailImages}
                    onMainImageChange={onMainImageChange}
                    onDetailImagesChange={onDetailImagesChange}
                    onPreview={onPreview}
                    mainImageRequired={mode === 'create'}
                />
                <StoreFormActions mode={mode} loading={loading} onCancel={onCancel} />
            </Form>
        </PageContainer>
    );
};

// MyStores와 동일한 스타일 — fontSize 직접 지정 없이 level={2} 기본값 사용
const styles = {
    title: {
        fontWeight: fontWeight.extrabold,
        margin: '0 0 8px',
    },
};

export default StoreForm;
