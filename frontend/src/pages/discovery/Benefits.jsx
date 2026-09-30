import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Pagination } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { DataState } from '../../components/common';
import BenefitListSkeleton from '../../components/common/BenefitListSkeleton';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { benefitKeys } from '../../hooks/queryKeys';
import benefitService from '../../services/benefitService';
import { BENEFIT_IMAGE_FALLBACK, getBenefitImageUrl } from './benefitPresentation';

export const BENEFIT_PAGE_SIZE = 12;

export const BenefitsSkeleton = BenefitListSkeleton;

function BenefitBannerImage({ imageUrl }) {
    const [failed, setFailed] = useState(false);
    const placeholder = failed || imageUrl === BENEFIT_IMAGE_FALLBACK;
    return (
        <span className={`reserve-benefit-media${placeholder ? ' reserve-benefit-media--placeholder' : ''}`}>
            <img className="reserve-benefit-thumbnail" src={placeholder ? BENEFIT_IMAGE_FALLBACK : imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => { if (!placeholder) setFailed(true); }} />
        </span>
    );
}
BenefitBannerImage.propTypes = { imageUrl: PropTypes.string.isRequired };

export function BenefitRow({ item }) {
    const imageUrl = getBenefitImageUrl(item.mainImageUrl);
    return (
        <Link to={`/benefits/${item.id}`} className="reserve-benefit-row" aria-label={`${item.storeName} · ${item.title} 소식 보기`}>
            <BenefitBannerImage key={imageUrl} imageUrl={imageUrl} />
            <div className="reserve-benefit-row-copy">
                {item.excerpt && <p className="reserve-benefit-description">{item.excerpt}</p>}
                <h2 className="reserve-benefit-store">{item.storeName}</h2>
                <span className="reserve-benefit-ticket"><span>{item.title}</span></span>
            </div>
        </Link>
    );
}
BenefitRow.propTypes = { item: PropTypes.object.isRequired };

export default function Benefits() {
    useDocumentTitle('혜택 · 가게 소식');
    const isMobile = useWindowWidth() < 576;
    const [params, setParams] = useSearchParams();
    const requested = Number(params.get('page') ?? 1);
    const page = Number.isSafeInteger(requested) && requested > 0 && requested <= 10000 ? requested : 1;
    const queryParams = { page: page - 1, size: BENEFIT_PAGE_SIZE };
    const { data, isPending, isFetching, isError, isSuccess, error, refetch } = useQuery({
        queryKey: benefitKeys.list(queryParams),
        queryFn: ({ signal }) => benefitService.getList(queryParams, signal),
        staleTime: 60000,
    });
    const items = Array.isArray(data?.content) ? data.content : [];
    const rawTotal = data?.page?.totalElements ?? data?.totalElements ?? 0;
    const total = Number.isSafeInteger(rawTotal) && rawTotal >= 0 ? rawTotal : 0;
    const totalPages = Math.max(1, Math.ceil(total / BENEFIT_PAGE_SIZE));
    const firstPageParams = new URLSearchParams(params);
    firstPageParams.delete('page');
    const firstPageTo = { pathname: '/benefits', search: firstPageParams.toString() };
    useEffect(() => {
        if (requested === page && (!isSuccess || isFetching || page <= totalPages)) return;
        const next = isSuccess ? Math.min(page, totalPages) : page;
        setParams(previous => {
            if (previous.get('page') !== params.get('page')) return previous;
            const updated = new URLSearchParams(previous);
            if (next === 1) updated.delete('page');
            else updated.set('page', String(next));
            return updated;
        }, { replace: true });
    }, [requested, page, isSuccess, isFetching, totalPages, params, setParams]);
    // 소식 본문 — 첫 로딩 → 실패 → 빈 페이지 → 목록 순으로 판정한다.
    const renderNews = () => {
        if (isPending) return <BenefitsSkeleton />;
        if (isError) {
            return (
                <DataState className="reserve-benefits-empty" state="error" kind="news" subject="가게 소식" error={error}
                    title="가게 소식을 불러오지 못했어요." onRetry={refetch} retrying={isFetching} />
            );
        }
        if (items.length === 0) {
            return <div className="reserve-benefits-empty"><p>{total > 0 ? '이 페이지에는 소식이 없어요.' : '아직 등록된 가게 소식이 없어요.'}</p><Link to={total > 0 ? firstPageTo : '/stores'} className="reserve-benefits-text-link">{total > 0 ? '첫 페이지로' : '가게 둘러보기'} <ArrowRightOutlined aria-hidden="true" /></Link></div>;
        }
        return <div className="reserve-benefit-list" aria-busy={isFetching}>{items.map(item => <BenefitRow key={item.id} item={item} />)}</div>;
    };
    return (
        <section className="reserve-benefits-page" aria-labelledby="benefits-title">
            <h1 id="benefits-title" className="reserve-discovery-visually-hidden">혜택</h1>
            <section id="benefit-news" className="reserve-benefits-news" aria-label="가게 소식">
                <div className="reserve-benefits-news-content">
                    {renderNews()}
                </div>
                {isFetching && !isPending && !isError && <p className="reserve-discovery-visually-hidden" role="status">소식을 새로 불러오는 중</p>}
                {!isPending && !isError && total > BENEFIT_PAGE_SIZE && (
                    <nav aria-label="가게 소식 페이지" className="reserve-benefits-pagination"><Pagination current={page} pageSize={BENEFIT_PAGE_SIZE} total={total} showSizeChanger={false} showLessItems={isMobile} size={isMobile ? 'small' : 'default'} disabled={isFetching} onChange={next => { const updated = new URLSearchParams(params); if (next === 1) { updated.delete('page'); } else { updated.set('page', String(next)); } setParams(updated); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }} /></nav>
                )}
            </section>
        </section>
    );
}
