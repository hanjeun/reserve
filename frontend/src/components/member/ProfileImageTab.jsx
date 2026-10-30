import React, { useState } from 'react';
import { Button } from '../../components/common';
import { useMessage } from '../../hooks';
import { memberService } from '../../services';
import { handleApiError } from '../../utils/errorHandler';
import ProfilePhotoPicker from '../common/ProfilePhotoPicker';
import ProfilePhotoResetButton from '../common/ProfilePhotoResetButton';
import useAuthStore from '../../store/useAuthStore';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';

const ProfileImageTab = ({ user }) => {
    const { message, confirm } = useMessage();
    const [loading, setLoading] = useState(false);
    // pending: null | 'reset' | { file: File, previewUrl: string }
    const [pending, setPending] = useState(null);

    React.useEffect(() => {
        return () => {
            if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        };
    }, [pending?.previewUrl]);

    const handleFileChange = file => {
        setPending({ file, previewUrl: URL.createObjectURL(file) });
    };

    const handleCancel = () => {
        setPending(null);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            if (pending?.file) {
                await memberService.uploadProfileImage(pending.file);
                message.success('프로필 사진이 변경됐어요');
            }
            await useAuthStore.getState().checkAuth(true);
            setPending(null);
        } catch (err) {
            handleApiError(err, message, '프로필 사진 변경에 실패했어요');
        } finally {
            setLoading(false);
        }
    };

    const handleResetToDefault = () => {
        confirm({
            title: '기본 이미지로 변경',
            content: '현재 프로필 사진을 삭제하고 기본 이미지로 되돌려요. 계속할까요?',
            okText: '변경', cancelText: '취소', centered: true,
            onOk: async () => {
                setLoading(true);
                try {
                    await memberService.deleteProfileImage();
                    message.success('기본 이미지로 변경됐어요');
                    await useAuthStore.getState().checkAuth(true);
                } catch (err) {
                    handleApiError(err, message, '프로필 사진 변경에 실패했어요');
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const previewSrc = pending?.previewUrl ?? (user?.profileImageUrl || user?.profileImage);
    // 취소/저장 버튼 행 — 새 이미지를 고르면 슬라이드 인으로 나타나는데, 취소를 누르면(pending이 null이
    // 되는 순간) 그 자리에서 바로 사라져서 "열릴 땐 애니메이션, 닫힐 땐 즉시"였던 것을 수정
    const showButtons = !!pending?.file;
    const reducedMotion = useReducedMotion();
    const { shouldRender: buttonsShouldRender, isClosing: buttonsClosing } = useExitAnimation(showButtons, reducedMotion ? 0 : 200);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>

            <ProfilePhotoPicker src={previewSrc} disabled={loading} onSelect={handleFileChange} animate={Boolean(pending?.previewUrl)} />

            <div style={{ display: 'grid', alignItems: 'start', width: '100%', marginTop: 4 }}>
                <div aria-hidden={buttonsShouldRender || undefined} inert={buttonsShouldRender ? true : undefined}
                    style={{ gridArea: '1 / 1', display: 'flex', flexDirection: 'column', visibility: buttonsShouldRender ? 'hidden' : undefined }}>
                    <ProfilePhotoResetButton onClick={handleResetToDefault} disabled={loading} />
                </div>
                {buttonsShouldRender && (
                    <div className="reserve-profile-photo-actions" aria-hidden={!showButtons || buttonsClosing || undefined}
                        inert={!showButtons || buttonsClosing ? true : undefined}
                        style={{ gridArea: '1 / 1', display: 'grid', gridTemplateRows: '1fr', animation: reducedMotion ? 'none'
                            : !showButtons || buttonsClosing ? 'reserve-feed-replies-exit 200ms ease-in both' : 'reserve-feed-replies-enter 200ms ease-out both' }}>
                    <div style={{ minHeight: 0, overflow: 'hidden' }}><div style={{ display: 'flex', gap: 8 }}>
                        <Button variant="outline" onClick={handleCancel} disabled={loading} style={{ flex: 1 }}>
                            취소
                        </Button>
                        <Button variant="primary" onClick={handleSave} loading={loading} style={{ flex: 1 }}>
                            저장
                        </Button>
                    </div></div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileImageTab;
