import React from 'react';
import { Form, Upload, Divider, message as antMessage } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const MAX_SIZE_MB = 10;

const validateImage = (file) => {
    if (!file.type.startsWith('image/')) {
        antMessage.error('이미지 파일만 업로드할 수 있습니다');
        return Upload.LIST_IGNORE;
    }
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > MAX_SIZE_MB) {
        antMessage.error(
            `파일 크기가 ${MAX_SIZE_MB}MB를 초과합니다 (현재 ${sizeMB.toFixed(1)}MB)`
        );
        return Upload.LIST_IGNORE;
    }
    return false;
};


const ImageThumbnail = (originNode, file, _, { remove }) => {
    const src = file.url || file.thumbUrl;
    return (
        <div style={thumbStyles.wrapper}>
            {src ? (
                <img src={src} alt={file.name} style={thumbStyles.img} />
            ) : (
                <div style={thumbStyles.placeholder}>
                    <PlusOutlined style={{ fontSize: 20, color: '#bbb' }} />
                </div>
            )}
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(); }}
                style={thumbStyles.removeBtn}
                title="삭제"
            >
                ×
            </button>
        </div>
    );
};

const thumbStyles = {
    wrapper: {
        position: 'relative',
        width: 104,
        height: 104,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #d9d9d9',
        background: '#fafafa',
        cursor: 'pointer',
    },
    img: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',   
        display: 'block',
    },
    placeholder: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    removeBtn: {
        position: 'absolute',
        top: 2,
        right: 4,
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        border: 'none',
        borderRadius: '50%',
        width: 18,
        height: 18,
        fontSize: 14,
        lineHeight: '16px',
        textAlign: 'center',
        cursor: 'pointer',
        padding: 0,
        zIndex: 1,
    },
};

/**
 * 가게 이미지 업로드 섹션
 *
 * 포함 항목:
 * - 대표 이미지 (최대 1장)
 * - 상세 이미지 (최대 5장)
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
                extra={`JPG · PNG · WEBP 등 이미지 파일 / 최대 ${MAX_SIZE_MB}MB`}
                rules={mainImageRequired ? [{ required: true, message: '대표 이미지를 등록해주세요' }] : []}
            >
                <Upload
                    listType="picture-card"
                    fileList={mainImage}
                    onChange={onMainImageChange}
                    onPreview={onPreview}
                    beforeUpload={validateImage}
                    itemRender={ImageThumbnail}
                    maxCount={1}
                >
                    {mainImage.length === 0 && <UploadButton />}
                </Upload>
            </Form.Item>

            {/* 상세 이미지 */}
            <Form.Item
                label="상세 이미지 (최대 5장)"
                name="detailImages"
                extra={`JPG · PNG · WEBP 등 이미지 파일 / 장당 최대 ${MAX_SIZE_MB}MB`}
            >
                <Upload
                    listType="picture-card"
                    fileList={detailImages}
                    onChange={onDetailImagesChange}
                    onPreview={onPreview}
                    beforeUpload={validateImage}
                    itemRender={ImageThumbnail}
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
