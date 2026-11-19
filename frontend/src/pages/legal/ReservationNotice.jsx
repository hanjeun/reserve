import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { PageContainer, DataState, Bone } from '../../components/common';
import { PageTitle } from '../../components/common/PageTypography';
import TextLink from '../../components/common/TextLink';
import { storeDetailPath } from '../../utils/storePublicAddress';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { reservationKeys } from '../../hooks/queryKeys';
import useTermsAnchorScroll from './useTermsAnchorScroll';
import ReservationConsentNotice from './ReservationConsentNotice';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

export default function ReservationNotice() {
    const { storeId } = useParams();
    const member = useAuthStore(state => state.user?.id);
    const revision = useAuthStore(state => state.sessionRevision);
    const valid = /^\d+$/.test(storeId || '') && Number.isSafeInteger(Number(storeId)) && Number(storeId) > 0;
    const notice = useQuery({ queryKey: reservationKeys.consent(member, revision, Number(storeId)),
        queryFn: ({ signal }) => api.get(`/api/reservations/notices/${storeId}`, { signal }), enabled: valid && Boolean(member), retry: false });
    const detailPath = storeDetailPath({ publicId: notice.data?.storePublicId });
    useDocumentTitle('예약 안내');
    useTermsAnchorScroll(notice.data?.details ? ['conditions', 'sharing'] : []);
    return <PageContainer size="md" paddingTop="60px">
        <div style={{ marginBottom: 40 }}><PageTitle>예약 안내</PageTitle></div>
        {notice.isPending && valid ? <div role="status" aria-label="예약 안내를 불러오고 있어요."><Bone height={96} /></div>
            : notice.isError ? <DataState state="error" error={notice.error} title="예약 안내를 불러오지 못했어요." onRetry={notice.refetch} />
                : !valid || !notice.data?.enabled || !notice.data?.details ? <DataState state="empty" title="현재 예약 안내를 확인할 수 없어요." />
                    : <>{['conditions', 'sharing'].map(section => <section key={section} id={section} tabIndex={-1} style={{ marginBottom: 32, scrollMarginTop: 88 }}>
                        <Typography.Title level={4} style={{ fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 12 }}>
                            {section === 'conditions' ? '예약·취소·환불 조건' : '가게에 예약 정보 제공'}
                        </Typography.Title>
                        <div style={{ fontSize: fontSize.base, color: colors.text.secondary, lineHeight: 1.8 }}>
                            <ReservationConsentNotice details={notice.data.details} section={section} />
                        </div>
                    </section>)}</>}
        {detailPath && <TextLink to={detailPath}>가게 보기</TextLink>}
    </PageContainer>;
}
