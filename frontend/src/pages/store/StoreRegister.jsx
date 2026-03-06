import React from 'react';
import { Form } from 'antd';
import StoreForm from '../../components/store/StoreForm';
import { useStoreForm, useImagePreview } from '../../hooks';

/**
 * 가게 등록 페이지
 * 
 * 기능:
 * - 가게 기본 정보 입력
 * - 대표 이미지 1장 업로드 (필수)
 * - 상세 이미지 최대 5장 업로드
 * - 영업 시간 설정
 * 
 * @route /store/register
 * @auth OWNER, ADMIN
 */
const StoreRegister = () => {
    const [form] = Form.useForm();
    const { handlePreview, PreviewModal } = useImagePreview();
    
    // 비즈니스 로직을 useStoreForm hook에 위임
    const {
        loading,
        mainImage,
        detailImages,
        handleSubmit,
        handleMainImageChange,
        handleDetailImagesChange,
    } = useStoreForm({ mode: 'create' });

    return (
        <>
            <StoreForm
                mode="create"
                form={form}
                onSubmit={handleSubmit}
                loading={loading}
                mainImage={mainImage}
                detailImages={detailImages}
                onMainImageChange={handleMainImageChange}
                onDetailImagesChange={handleDetailImagesChange}
                onPreview={handlePreview}
            />
            
            {/* 이미지 미리보기 모달 */}
            <PreviewModal />
        </>
    );
};

export default StoreRegister;
