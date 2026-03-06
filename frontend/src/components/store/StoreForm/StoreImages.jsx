import React from 'react';
import { Form, Upload, Divider } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

/**
 * 가게 이미지 업로드 섹션
 * 
 * 포함 항목:
 * - 대표 이미지 (최대 1장)
 * - 상세 이미지 (최대 5장)
 * 
 * @param {Object} props
 * @param {Array} props.mainImage - 대표 이미지 fileList
 * @param {Array} props.detailImages - 상세 이미지 fileList
 * @param {Function} props.onMainImageChange - 대표 이미지 변경 핸들러
 * @param {Function} props.onDetailImagesChange - 상세 이미지 변경 핸들러
 * @param {Function} props.onPreview - 이미지 미리보기 핸들러
 * @param {boolean} props.mainImageRequired - 대표 이미지 필수 여부
 */
const StoreImages = ({
    mainImage = [],
    detailImages = [],
    onMainImageChange,
    onDetailImagesChange,
    onPreview,
    mainImageRequired = true,
}) => {
    return (
        <>
            <Divider>이미지 등록</Divider>

            {/* 대표 이미지 */}
            <Form.Item 
                label="대표 이미지" 
                name="mainImage"
                rules={mainImageRequired ? [{ required: true, message: '대표 이미지를 등록해주세요' }] : []}
            >
                <Upload
                    listType="picture-card"
                    fileList={mainImage}
                    onChange={onMainImageChange}
                    onPreview={onPreview}
                    beforeUpload={() => false}
                    maxCount={1}
                >
                    {mainImage.length === 0 && <UploadButton />}
                </Upload>
            </Form.Item>

            {/* 상세 이미지 */}
            <Form.Item label="상세 이미지 (최대 5장)" name="detailImages">
                <Upload
                    listType="picture-card"
                    fileList={detailImages}
                    onChange={onDetailImagesChange}
                    onPreview={onPreview}
                    beforeUpload={() => false}
                    maxCount={5}
                >
                    {detailImages.length < 5 && <UploadButton />}
                </Upload>
            </Form.Item>
        </>
    );
};

/**
 * 업로드 버튼 컴포넌트
 */
const UploadButton = () => (
    <div>
        <PlusOutlined />
        <div style={{ marginTop: 8 }}>업로드</div>
    </div>
);

export default StoreImages;
