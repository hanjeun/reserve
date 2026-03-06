import { useState, useCallback } from 'react';
import { Image } from 'antd';

/** Upload 컴포넌트의 이미지 미리보기 훅 */
const useImagePreview = () => {
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');

    const handlePreview = useCallback(async (file) => {
        let url = file.url
            || (file.originFileObj && URL.createObjectURL(file.originFileObj))
            || file.preview;
        if (!url) return;
        setPreviewImage(url);
        setPreviewOpen(true);
    }, []);

    const handleCancel = useCallback(() => {
        setPreviewOpen(false);
        if (previewImage?.startsWith('blob:')) URL.revokeObjectURL(previewImage);
        setPreviewImage('');
    }, [previewImage]);

    /** AntD Image 미리보기 트리거 (hidden) */
    const PreviewModal = useCallback(() => {
        if (!previewImage) return null;
        return (
            <Image
                style={{ display: 'none' }}
                src={previewImage}
                preview={{
                    open: previewOpen,
                    onOpenChange: (v) => { if (!v) handleCancel(); },
                    src: previewImage,
                }}
            />
        );
    }, [previewOpen, previewImage, handleCancel]);

    return { previewOpen, previewImage, handlePreview, handleCancel, PreviewModal };
};

export default useImagePreview;
