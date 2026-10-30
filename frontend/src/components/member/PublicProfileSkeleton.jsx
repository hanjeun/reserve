import { useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import Bone from '../common/Bone';
import Button from '../common/Button';
import SkeletonText from '../common/SkeletonText';
import { field, radius } from '../../styles/tokens';
import { feedKeys } from '../../hooks/feedQueries';
import { readFeedCommentForProfile } from '../../utils/feedCommentProfileNavigation';

export default function PublicProfileSkeleton() {
    const client = useContext(QueryClientContext);
    const hasProfile = Boolean(client?.getQueryData(feedKeys.profile()));
    const profile = client?.getQueryData(feedKeys.profile());
    const photoSource = profile?.avatarSource || (profile ? profile.useAccountAvatar ? 'ACCOUNT' : 'NONE' : 'ACCOUNT');
    const returnToComment = Boolean(readFeedCommentForProfile());
    return <div aria-label="공개 프로필을 불러오는 중" aria-busy="true">
        <div aria-hidden="true" style={{ marginBottom: 16 }}>
            <div style={{ paddingBottom: 8, fontSize: 16, lineHeight: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <SkeletonText>피드 프로필 사진</SkeletonText>
                {hasProfile && <Bone width={44} height={44} borderRadius={radius.md} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: 8 }}>
                <Bone width={80} height={80} borderRadius="50%" />
                <span style={{ fontSize: 12 }}><SkeletonText>클릭하여 사진 변경</SkeletonText></span>
                {photoSource !== 'NONE' && <SkeletonText style={{ fontSize: 13, paddingBlock: 2 }}>기본 이미지로 변경</SkeletonText>}
                {photoSource !== 'ACCOUNT' && <SkeletonText style={{ fontSize: 13, paddingBlock: 2 }}>계정 사진으로 되돌리기</SkeletonText>}
            </div>
        </div>
        <div style={{ marginBottom: 16 }}>
            <div style={{ paddingBottom: 8, fontSize: 16, lineHeight: '24px' }}><SkeletonText>공개 닉네임</SkeletonText></div>
            <Bone width="100%" height={field.height} borderRadius={field.radius} />
        </div>
        <div style={{ marginBottom: 16 }}>
            <div style={{ paddingBottom: 8, fontSize: 16, lineHeight: '24px' }}><SkeletonText>소개 (선택)</SkeletonText></div>
            <Bone width="100%" height={96} borderRadius={field.radius} />
        </div>
        <Button disabled block><SkeletonText>저장</SkeletonText></Button>
        <div className="reserve-account-public-profile-actions" aria-hidden="true">
            {returnToComment && <Bone width={44} height={44} borderRadius={radius.md} style={{ marginRight: 'auto' }} />}
        </div>
    </div>;
}
