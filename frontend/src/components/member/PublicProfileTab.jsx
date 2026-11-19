import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Button, DataState } from '../common';
import FeedProfileFields from '../feed/FeedProfileFields';
import { useFeedProfile } from '../../hooks/feedQueries';
import useSaveFeedProfile from '../../hooks/useSaveFeedProfile';
import { authorPath } from '../../utils/feed';
import { resolveProfileAvatar } from '../../utils/image';
import { currentSession } from '../../api/sessionScope';
import useAuthStore from '../../store/useAuthStore';
import PublicProfileSkeleton from './PublicProfileSkeleton';
import { readFeedCommentForProfile } from '../../utils/feedCommentProfileNavigation';
import ProfilePhotoPicker from '../common/ProfilePhotoPicker';
import ProfilePhotoResetButton from '../common/ProfilePhotoResetButton';
import IconTool from '../common/IconTool';
import { ArrowLeftOutlined, SyncOutlined, UserOutlined } from '../common/icons';
import { isReadAccessDenied } from '../../hooks/liveUpdateQueries';
import useReducedMotion from '../../hooks/useReducedMotion';

const NICKNAME_SUGGESTIONS = [
    '땅을 파는 두더지', '고개를 내민 수달', '느긋한 거북이', '낮잠 자는 고양이',
    '산책 나온 펭귄', '메뉴 고르는 너구리', '나뭇잎 모으는 토끼', '햇살 보는 고슴도치',
    '콩을 줍는 다람쥐', '꽃을 보는 참새', '별을 세는 여우', '빵을 굽는 곰',
];

function PublicProfileEditor({ profile }) {
    const [form] = Form.useForm();
    const lock = useRef(false);
    const session = useRef(currentSession().epoch);
    const accountImage = useAuthStore(state => state.user?.profileImageUrl || state.user?.profileImage);
    const reducedMotion = useReducedMotion();
    const [pendingPhoto, setPendingPhoto] = useState(null);
    useEffect(() => () => { if (pendingPhoto?.url) URL.revokeObjectURL(pendingPhoto.url); }, [pendingPhoto?.url]);
    const navigate = useNavigate();
    const commentDraft = readFeedCommentForProfile();
    const returnToComment = () => {
        const current = readFeedCommentForProfile();
        if (current) navigate(current.path, { replace: true });
    };
    const save = useSaveFeedProfile(data => {
        form.setFieldsValue({ nickname: data.nickname, bio: data.bio, visibility: data.visibility || 'PRIVATE' });
        setPendingPhoto(null);
    });
    const submit = async values => {
        if (lock.current || save.isPending) return;
        lock.current = true;
        try { await save.mutateAsync({ ...values, session: session.current, avatarFile: pendingPhoto?.file,
            resetPhoto: pendingPhoto === 'reset' }); }
        catch { /* 공유 저장 처리에서 오류를 표시하고 입력값을 보존한다. */ }
        finally { lock.current = false; }
    };
    const suggestNickname = () => {
        if (lock.current || save.isPending) return;
        const current = form.getFieldValue('nickname')?.trim();
        const choices = NICKNAME_SUGGESTIONS.filter(name => name !== current);
        form.setFieldValue('nickname', choices[Math.floor(Math.random() * choices.length)]);
    };
    const savedImage = resolveProfileAvatar(profile, accountImage);
    const preview = pendingPhoto === 'reset' ? undefined : pendingPhoto?.url || savedImage;
    const publicPath = authorPath(profile?.publicId);
    const legacyVisibility = Boolean(profile?.publicId && !profile.visibility);
    return <Form form={form} layout="vertical" size="large" requiredMark={false} disabled={save.isPending} onFinish={submit}
        initialValues={{ nickname: profile?.nickname || '', bio: profile?.bio || '',
            visibility: legacyVisibility ? undefined : profile?.visibility || 'PRIVATE' }}>
        <FeedProfileFields legacyVisibility={legacyVisibility}
            nicknameTool={<IconTool label="랜덤 닉네임" icon={<SyncOutlined aria-hidden="true" />} onClick={suggestNickname} disabled={save.isPending} />}
            avatarField={<Form.Item className="reserve-account-public-profile-avatar"
            label={<><span>프로필 사진</span>{publicPath && <IconTool label="내 프로필 보기" icon={<UserOutlined aria-hidden="true" />}
                disabled={save.isPending} to={publicPath} />}</>} style={{ marginBottom: 16 }}>
            <div className="reserve-profile-picker">
                <ProfilePhotoPicker src={preview} disabled={save.isPending} animate={!reducedMotion && Boolean(pendingPhoto)}
                    onSelect={file => setPendingPhoto({ file, url: URL.createObjectURL(file) })} />
                {pendingPhoto
                    ? <ProfilePhotoResetButton disabled={save.isPending} onClick={() => setPendingPhoto(null)}>사진 변경 취소</ProfilePhotoResetButton>
                    : savedImage && <ProfilePhotoResetButton disabled={save.isPending} onClick={() => setPendingPhoto('reset')} />}
            </div>
        </Form.Item>} />
        <Button htmlType="submit" loading={save.isPending} block>저장</Button>
        <div className="reserve-account-public-profile-actions">
            {commentDraft && <span style={{ marginRight: 'auto' }}><IconTool kind="navigation" label="댓글로 돌아가기" icon={<ArrowLeftOutlined aria-hidden="true" />}
                disabled={save.isPending} onClick={returnToComment} /></span>}
        </div>
    </Form>;
}
PublicProfileEditor.propTypes = { profile: PropTypes.object };

export default function PublicProfileTab() {
    const memberId = useAuthStore(state => state.user?.id);
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const profile = useFeedProfile(Boolean(memberId));
    if (profile.isError && (profile.data === undefined || isReadAccessDenied(profile.error))) {
        return <DataState compact state="error" title="프로필을 불러오지 못했어요." error={profile.error}
            onRetry={profile.refetch} retrying={profile.isFetching} />;
    }
    if (profile.isPending) return <PublicProfileSkeleton />;
    return <>
        <PublicProfileEditor key={`${memberId}:${sessionRevision}`} profile={profile.data} />
        {profile.isError && <DataState compact state="error" role="status" aria-live="polite"
            title="최신 정보를 불러오지 못했어요." error={profile.error}
            onRetry={profile.refetch} retrying={profile.isFetching} />}
    </>;
}
