import { PageTitle } from '../../components/common/PageTypography';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { DataState } from '../../components/common';
import BenefitDetailSkeleton from '../../components/common/BenefitDetailSkeleton';
import { benefitKeys } from '../../hooks/queryKeys';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import benefitService from '../../services/benefitService';
import { httpStatusOf, isMissingRequestError } from '../../utils/listErrorMessage';
import { BENEFIT_IMAGE_FALLBACK, formatBenefitDate, getBenefitImageUrl } from './benefitPresentation';

export default function BenefitDetail() {
    const { id } = useParams();
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
    if (missing) return <section className="reserve-benefits-page"><DataState state="empty" requestType="detail" kind="news" title="현재 공개된 가게 소식이 아니에요."
        action={<Link className="reserve-benefits-text-link" to="/benefits">소식 목록으로</Link>} /></section>;
    if (isPending) return <BenefitDetailSkeleton role="status" aria-label="가게 소식을 불러오는 중" aria-busy="true" />;
    if (isError) return <section className="reserve-benefits-page"><DataState state="error" requestType="detail" kind="news" subject="가게 소식" error={error}
        title="가게 소식을 불러오지 못했어요." onRetry={refetch} retrying={isFetching} /></section>;
    return (
        <article className="reserve-benefits-page reserve-benefit-detail" aria-labelledby="benefit-detail-title">
            <header className="reserve-benefits-heading"><div><span className="reserve-benefits-eyebrow">가게 소식 · 안내</span><PageTitle level={1} id="benefit-detail-title">{item.title}</PageTitle><Link to={`/store/${item.storeId}`} className="reserve-benefits-text-link">{item.storeName}</Link><time dateTime={item.createdAt || undefined}>{formatBenefitDate(item.createdAt)}</time></div></header>
            <img className={`reserve-benefit-detail-image${getBenefitImageUrl(item.mainImageUrl) === BENEFIT_IMAGE_FALLBACK ? ' reserve-benefit-detail-image--placeholder' : ''}`} src={getBenefitImageUrl(item.mainImageUrl)} alt={getBenefitImageUrl(item.mainImageUrl) === BENEFIT_IMAGE_FALLBACK ? '가게 사진이 등록되지 않았어요' : `${item.storeName} 가게 사진`} onError={event => { if (!event.currentTarget.src.endsWith(BENEFIT_IMAGE_FALLBACK)) { event.currentTarget.src = BENEFIT_IMAGE_FALLBACK; event.currentTarget.alt = '가게 사진을 불러오지 못했어요'; event.currentTarget.classList.add('reserve-benefit-detail-image--placeholder'); } }} />
            {/* 본문은 원문 텍스트로만 출력한다. HTML/Markdown으로 해석하지 않는다. */}
            <div className="reserve-benefit-detail-content">{item.content}</div>
            <p className="reserve-benefits-disclaimer">적용 조건과 제공 여부는 가게의 안내를 확인해 주세요. 쿠폰 발급·사용 기능은 제공하지 않아요.</p>
            <footer className="reserve-benefit-detail-links"><Link className="reserve-benefits-text-link" to="/benefits">소식 목록</Link><Link className="reserve-benefits-text-link" to={`/store/${item.storeId}`}>가게 보기 →</Link></footer>
        </article>
    );
}
