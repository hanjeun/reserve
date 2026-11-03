import React, { useLayoutEffect, useRef, useState } from 'react';
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
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const [loading, setLoading] = useState(false);
    const mounted = useRef(false);
    const activeRequest = useRef(null);
    const scope = `${user?.id}:${user?.role}:${sessionRevision}`;
    // pending: null | 'reset' | { file: File, previewUrl: string }
    const [pending, setPending] = useState(null);

    useLayoutEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            activeRequest.current = null;
        };
    }, [scope]);

    const isCurrent = request => {
        const auth = useAuthStore.getState();
        return mounted.current && activeRequest.current === request && auth.isLoggedIn
            && auth.sessionRevision === sessionRevision && user?.id != null && user?.role
            && auth.user?.id === user.id && auth.user?.role === user.role;
    };

    const beginRequest = phase => {
        if (activeRequest.current) return null;
        const request = { phase };
        activeRequest.current = request;
        if (isCurrent(request)) return request;
        activeRequest.current = null;
        return null;
    };

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

    const savePhoto = async (request, save, successMessage) => {
        if (!isCurrent(request)) return;
        setLoading(true);
        try {
            await save();
            if (!isCurrent(request)) return;
            await useAuthStore.getState().checkAuth(true);
            if (!isCurrent(request)) return;
            message.success(successMessage);
            setPending(null);
        } catch (err) {
            if (isCurrent(request)) handleApiError(err, message, '프로필 사진 변경에 실패했어요');
        } finally {
            if (isCurrent(request)) {
                setLoading(false);
                activeRequest.current = null;
            }
        }
    };

    const handleSave = () => {
        if (!pending?.file) return;
        const request = beginRequest('saving');
        if (request) return savePhoto(request, () => memberService.uploadProfileImage(pending.file), '프로필 사진이 변경됐어요');
    };

    const handleResetToDefault = () => {
        const request = beginRequest('confirm');
        if (!request) return;
        confirm({
            title: '기본 이미지로 변경',
            content: '현재 프로필 사진을 삭제하고 기본 이미지로 되돌려요. 계속할까요?',
            okText: '변경', cancelText: '취소', centered: true,
            onCancel: () => {
                if (isCurrent(request) && request.phase === 'confirm') activeRequest.current = null;
            },
            onOk: () => {
                // Portal에 남은 확인창은 원래 회원·세션과 현재 컴포넌트에서만 실행한다.
                if (!isCurrent(request) || request.phase !== 'confirm') return;
                request.phase = 'saving';
                return savePhoto(request, () => memberService.deleteProfileImage(), '기본 이미지로 변경됐어요');
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
