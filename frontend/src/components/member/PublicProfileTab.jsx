import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Button, DataState } from '../common';
import FeedProfileFields from '../feed/FeedProfileFields';
import { useFeedConfig, useFeedProfile } from '../../hooks/feedQueries';
import useSaveFeedProfile from '../../hooks/useSaveFeedProfile';
import { authorPath } from '../../utils/feed';
import { currentSession } from '../../api/sessionScope';
import useAuthStore from '../../store/useAuthStore';
import PublicProfileSkeleton from './PublicProfileSkeleton';
import { readFeedCommentForProfile } from '../../utils/feedCommentProfileNavigation';
import FeedProfileAvatarField from './FeedProfileAvatarField';
import IconTool from '../common/IconTool';
import { ArrowLeftOutlined, UserOutlined } from '../common/icons';
import { isReadAccessDenied } from '../../hooks/liveUpdateQueries';

const avatarSource = profile => profile?.avatarSource || (profile ? profile.useAccountAvatar ? 'ACCOUNT' : 'NONE' : 'ACCOUNT');

function PublicProfileEditor({ profile }) {
    const [form] = Form.useForm();
    const lock = useRef(false);
    const session = useRef(currentSession().epoch);
    const accountImage = useAuthStore(state => state.user?.profileImageUrl || state.user?.profileImage);
    const [pendingPhoto, setPendingPhoto] = useState(null);
    useEffect(() => () => { if (pendingPhoto?.url) URL.revokeObjectURL(pendingPhoto.url); }, [pendingPhoto?.url]);
    const navigate = useNavigate();
    const commentDraft = readFeedCommentForProfile();
    const returnToComment = () => {
        const current = readFeedCommentForProfile();
        if (current) navigate(`/feed/posts/${current.postId}#comments`, { replace: true });
    };
    const save = useSaveFeedProfile(data => { form.setFieldsValue({ ...data, avatarSource: avatarSource(data) }); setPendingPhoto(null); });
    const submit = async values => {
        if (lock.current || save.isPending) return;
        lock.current = true;
        try { await save.mutateAsync({ ...values, session: session.current, avatarFile: pendingPhoto?.file,
            previousAvatarSource: profile ? avatarSource(profile) : 'NONE' }); }
        catch { /* 공유 저장 처리에서 오류를 표시하고 입력값을 보존한다. */ }
        finally { lock.current = false; }
    };
    return <Form form={form} layout="vertical" size="large" requiredMark={false} disabled={save.isPending} onFinish={submit}
        initialValues={{ nickname: profile?.nickname || '', bio: profile?.bio || '', avatarSource: avatarSource(profile) }}>
        <FeedProfileFields avatarField={<Form.Item name="avatarSource" label="피드 프로필 사진" style={{ marginBottom: 16 }}
            rules={[{ validator: (_, value) => value !== 'CUSTOM' || pendingPhoto?.file || profile?.avatarSource === 'CUSTOM'
                ? Promise.resolve() : Promise.reject(new Error('피드에서 사용할 사진을 골라주세요.')) }]}>
            <FeedProfileAvatarField accountImage={accountImage} customImage={profile?.avatarSource === 'CUSTOM' ? profile.avatarUrl : undefined}
                pendingImage={pendingPhoto?.url} disabled={save.isPending}
                onReset={() => setPendingPhoto(null)}
                onSelect={file => setPendingPhoto({ file, url: URL.createObjectURL(file) })} />
        </Form.Item>} />
        <Button htmlType="submit" loading={save.isPending} block>저장</Button>
        <div className="reserve-account-public-profile-actions">
            {commentDraft && <span style={{ marginRight: 'auto' }}><IconTool kind="navigation" label="댓글로 돌아가기" icon={<ArrowLeftOutlined aria-hidden="true" />}
                disabled={save.isPending} onClick={returnToComment} /></span>}
            {profile && <IconTool label="내 공개 프로필 보기" icon={<UserOutlined aria-hidden="true" />}
                disabled={save.isPending} to={authorPath(profile.publicId)} />}
        </div>
    </Form>;
}
PublicProfileEditor.propTypes = { profile: PropTypes.object };

export default function PublicProfileTab() {
    const memberId = useAuthStore(state => state.user?.id);
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const config = useFeedConfig();
    const profile = useFeedProfile(config.data?.enabled === true);
    const failedConfig = config.isError && (config.data === undefined || isReadAccessDenied(config.error));
    const failedProfile = config.data?.enabled === true && profile.isError
        && (profile.data === undefined || isReadAccessDenied(profile.error));
    if (failedConfig || failedProfile) {
        const failed = failedConfig ? config : profile;
        return <DataState compact state="error" title="공개 프로필을 불러오지 못했어요." error={failed.error}
            onRetry={failed.refetch} retrying={failed.isFetching} />;
    }
    if (config.isPending || config.data?.enabled === true && profile.isPending) return <PublicProfileSkeleton />;
    if (!config.data?.enabled) return <DataState state="empty" kind="news" title="공개 프로필을 준비하고 있어요." />;
    const refreshFailure = config.isError ? config : profile.isError ? profile : null;
    return <>
        <PublicProfileEditor key={`${memberId}:${sessionRevision}`} profile={profile.data} />
        {refreshFailure && <DataState compact state="error" role="status" aria-live="polite"
            title="최신 정보를 불러오지 못했어요." error={refreshFailure.error}
            onRetry={refreshFailure.refetch} retrying={refreshFailure.isFetching} />}
    </>;
}
