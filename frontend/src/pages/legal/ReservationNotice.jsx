import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, DataState, Bone } from '../../components/common';
import { PageTitle } from '../../components/common/PageTypography';
import TextLink from '../../components/common/TextLink';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useTermsAnchorScroll from './useTermsAnchorScroll';
import ReservationConsentNotice from './ReservationConsentNotice';

export default function ReservationNotice() {
    const { storeId } = useParams();
    const member = useAuthStore(state => state.user?.id);
    const revision = useAuthStore(state => state.sessionRevision);
    const valid = /^\d+$/.test(storeId || '') && Number.isSafeInteger(Number(storeId)) && Number(storeId) > 0;
    const notice = useQuery({ queryKey: ['reservation-consent', member, revision, Number(storeId)],
        queryFn: ({ signal }) => api.get(`/api/reservations/notices/${storeId}`, { signal }), enabled: valid && Boolean(member), retry: false });
    useDocumentTitle('예약 안내');
    useTermsAnchorScroll(notice.data?.details ? ['conditions', 'sharing'] : []);
    return <PageContainer size="md" paddingTop="60px">
        <PageTitle>예약 안내</PageTitle>
        {notice.isPending && valid ? <div role="status" aria-label="예약 안내를 불러오고 있어요."><Bone height={96} /></div>
            : notice.isError ? <DataState state="error" error={notice.error} title="예약 안내를 불러오지 못했어요." onRetry={notice.refetch} />
                : !valid || !notice.data?.enabled || !notice.data?.details ? <DataState state="empty" title="현재 예약 안내를 확인할 수 없어요." />
                    : <>{['conditions', 'sharing'].map(section => <section key={section} id={section} tabIndex={-1} style={{ marginTop: 32, scrollMarginTop: 88 }}>
                        <PageTitle level={2}>{section === 'conditions' ? '예약·취소·환불 조건' : '가게에 예약 정보 제공'}</PageTitle>
                        <ReservationConsentNotice details={notice.data.details} section={section} />
                    </section>)}</>}
        {valid && <TextLink to={`/store/${storeId}`}>가게 보기</TextLink>}
    </PageContainer>;
}
