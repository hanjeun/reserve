import { useState, useCallback } from 'react';
import { Image } from 'antd';

/**
 * Upload 컴포넌트의 이미지 미리보기 훅
 *
 * 기존: display:none 인 Image에 open:true 로 강제 열기
 *   → AntD가 원본 이미지 위치를 모르므로 애니메이션 없이 그냥 나타남
 *
 * 변경: Image.PreviewGroup + items 방식 (AntD v5+)
 *   → 소스 이미지가 화면에 없어도 AntD PreviewGroup 자체 애니메이션(fade+scale) 적용됨
 *   → StoreDetail의 Image 미리보기와 동일한 AntD 애니메이션 사용
 */
const useImagePreview = () => {
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');

    const handlePreview = useCallback(async (file) => {
        const url = file.url
            || (file.originFileObj && URL.createObjectURL(file.originFileObj))
            || file.preview;
        if (!url) return;
        setPreviewImage(url);
        setPreviewOpen(true);
    }, []);

    const handleCancel = useCallback(() => {
        setPreviewOpen(false);
        // blob URL은 메모리 누수 방지를 위해 즉시 해제
        if (previewImage?.startsWith('blob:')) URL.revokeObjectURL(previewImage);
        setPreviewImage('');
    }, [previewImage]);

    /**
     * Image.PreviewGroup + items 방식
     * - 소스 Image가 display:none 이 아니므로 AntD가 올바른 애니메이션 기준점을 찾음
     * - visible / onVisibleChange 로 열기/닫기를 외부에서 제어
     */
    const PreviewModal = useCallback(() => {
        if (!previewImage) return null;
        return (
            <Image.PreviewGroup
                items={[{ src: previewImage }]}
                preview={{
                    visible: previewOpen,
                    onVisibleChange: (visible) => { if (!visible) handleCancel(); },
                    current: 0,
                }}
            />
        );
    }, [previewOpen, previewImage, handleCancel]);

    return { previewOpen, previewImage, handlePreview, handleCancel, PreviewModal };
};

export default useImagePreview;
