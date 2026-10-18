import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, DataState } from '../../components/common';
import BenefitDetailSkeleton from '../../components/common/BenefitDetailSkeleton';
import { BenefitDetailContent } from '../../components/store-news/StoreNewsPresentation';
import PostInteractionBar from '../../components/feed/PostInteractionBar';
import { benefitKeys } from '../../hooks/queryKeys';
import { useStoreNewsConfig } from '../../hooks/storeNewsQueries';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import benefitService from '../../services/benefitService';
import useStoreNewsEvents from '../../hooks/useStoreNewsEvents';
import { httpStatusOf, isMissingRequestError } from '../../utils/listErrorMessage';
import useAuthStore from '../../store/useAuthStore';
import { saveRedirect } from '../../utils/redirect';

const FeedReportModal = lazy(() => import('../../components/feed/FeedReportModal'));

export default function BenefitDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const user = useAuthStore(state => state.user);
    const [reportOpen, setReportOpen] = useState(false);
    const [reportMounted, setReportMounted] = useState(false);
    const config = useStoreNewsConfig();
    useStoreNewsEvents(config.data?.benefitEventsEnabled === true && config.data?.enabled === true);
    const validId = /^\d+$/.test(id ?? '') && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    const { data: item, isPending, isError, error, isFetching, refetch } = useQuery({
        queryKey: benefitKeys.detail(id),
        queryFn: ({ signal }) => benefitService.getDetail(id, signal),
        enabled: validId,
        retry: (count, failure) => {
            const status = httpStatusOf(failure);
            if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
            return count < 1;
        },
        staleTime: 60000,
    });
    const missing = !validId || isMissingRequestError(error);
    useDocumentTitle(!missing && item?.title ? `${item.title} · 가게 소식` : '가게 소식');
    const report = () => {
        if (user) { setReportMounted(true); setReportOpen(true); return; }
        const pathname = `/benefits/${id}`;
        saveRedirect(pathname);
        navigate('/login', { state: { from: { pathname } } });
    };
    if (missing) return <section className="reserve-benefits-page"><DataState state="empty" requestType="detail" kind="news" title="현재 공개된 가게 소식이 아니에요."
        action={<Link className="reserve-benefits-text-link" to="/benefits">소식 목록으로</Link>} /></section>;
    if (isPending) return <BenefitDetailSkeleton role="status" aria-label="가게 소식을 불러오는 중" aria-busy="true" />;
    if (isError && !item) return <section className="reserve-benefits-page"><DataState state="error" requestType="detail" kind="news" subject="가게 소식" error={error}
        title="가게 소식을 불러오지 못했어요." onRetry={refetch} retrying={isFetching} /></section>;
    return <><BenefitDetailContent item={item} actions={<>{isError && <DataState compact state="error" title="최신 내용을 확인하지 못했어요. 현재 내용은 유지했어요." error={error} onRetry={refetch} retrying={isFetching} />}<PostInteractionBar type="NEWS" targetId={Number(id)} />{config.data?.enabled && <Button variant="ghost-sm" onClick={report}>소식 신고</Button>}
        {user?.role === 'BUSINESS' && <Link className="reserve-benefits-text-link" to="/business?tab=news">내 소식 관리</Link>}</>} />
        <Suspense fallback={null}>{reportMounted && <FeedReportModal newsId={reportOpen ? Number(id) : null} onClose={() => setReportOpen(false)} />}</Suspense></>;
}
