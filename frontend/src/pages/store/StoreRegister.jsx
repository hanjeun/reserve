import React from 'react';
import { Form } from 'antd';
import StoreOnboarding from '../../components/store/StoreOnboarding';
import { useStoreForm, useImagePreview } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const StoreRegister = () => {
    useDocumentTitle('가게 등록');
    const [form] = Form.useForm();
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();

    // 비즈니스 로직을 useStoreForm hook에 위임
    const {
        loading,
        mainImage,
        detailImages,
        handleSubmit,
        handleMainImageChange,
        handleDetailImagesChange,
        draftState,
        handleValuesChange,
        saveDraftNow,
    } = useStoreForm({ mode: 'create', form });

    return (
        <>
            <StoreOnboarding
                form={form}
                onSubmit={handleSubmit}
                loading={loading}
                mainImage={mainImage}
                detailImages={detailImages}
                onMainImageChange={handleMainImageChange}
                onDetailImagesChange={handleDetailImagesChange}
                onPreview={handlePreview}
                onPreviewClickCapture={suppressLinkNavigation}
                onValuesChange={handleValuesChange}
                onSaveDraft={saveDraftNow}
                draftState={draftState}
            />
            
            {/* 이미지 미리보기 모달 */}
            {previewNode}
        </>
    );
};

export default StoreRegister;
