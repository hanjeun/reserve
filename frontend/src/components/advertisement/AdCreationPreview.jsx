import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import dayjs from 'dayjs';
import { RefreshButton } from '../common';
import { AD_TYPE_LABELS, normalizeBannerMotionKey } from '../../constants';
import StoreCard from '../store/StoreCard';
import StoreListRow from '../store/StoreListRow';
import AdBannerSurface from './AdBannerSurface';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const motionClass = key => key.toLowerCase().replaceAll('_', '-');
const won = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
const formatDay = value => {
    const day = dayjs(value);
    return day.isValid() ? `${day.month() + 1}월 ${day.date()}일 (${WEEKDAYS[day.day()]})` : String(value ?? '');
};

/*
 * 실제 목록 컴포넌트를 공유하되 미리보기의 이동·즐겨찾기·노출 집계는 실행하지 않는다.
 */
const AdCreationPreview = ({
    adType, store, copy, motionKey, imageSrc, startDate, endDate, exposureDays, dailyPrice, amount,
}) => {
    const [replay, setReplay] = useState(0);
    const normalizedMotion = normalizeBannerMotionKey(motionKey);
    const storeName = store?.name || '선택한 가게';
    const ad = useMemo(() => ({
        storeName,
        title: copy?.title || '',
        description: copy?.description || '',
    }), [copy, storeName]);
    const previewStore = store?.id ? store : { id: 'preview', name: storeName };
    const period = startDate === endDate
        ? formatDay(startDate)
        : `${formatDay(startDate)} ~ ${formatDay(endDate)}`;

    return (
        <div className="reserve-ad-create-preview">
            {adType === 'BANNER' ? (
                <section className="reserve-ad-preview-section" aria-labelledby="reserve-ad-preview-banner-title">
                    <div className="reserve-ad-preview-section__head">
                        <h4 id="reserve-ad-preview-banner-title">가게 목록 화면</h4>
                        <RefreshButton label="효과 다시 보기" onReload={() => setReplay(value => value + 1)} />
                    </div>
                    <div className="reserve-ad-final-preview-stage">
                        <div className="reserve-ad-final-preview-stage__content" aria-hidden="true">
                            <i /><i /><i />
                        </div>
                        <div
                            key={`${normalizedMotion}-${replay}`}
                            className={`reserve-ad-final-banner reserve-ad-final-banner--${motionClass(normalizedMotion)}`}
                            data-motion={normalizedMotion}
                        >
                            {imageSrc ? (
                                <AdBannerSurface ad={ad} imageSrc={imageSrc} interactive={false} />
                            ) : (
                                <div className="reserve-ad-final-preview-loading">이미지를 준비하고 있어요</div>
                            )}
                        </div>
                    </div>
                </section>
            ) : (
                <div className="reserve-ad-placement-preview">
                    <section className="reserve-ad-preview-section" aria-labelledby="reserve-ad-preview-card-title">
                        <h4 id="reserve-ad-preview-card-title">카드 보기</h4>
                        <div className="reserve-ad-preview-screen">
                            <div className="reserve-ad-preview-screen__card">
                                <StoreCard store={previewStore} isAdvertised preview />
                            </div>
                        </div>
                    </section>
                    <section className="reserve-ad-preview-section" aria-labelledby="reserve-ad-preview-row-title">
                        <h4 id="reserve-ad-preview-row-title">리스트 보기</h4>
                        <div className="reserve-ad-preview-screen">
                            <div className="reserve-store-list-rows">
                                <StoreListRow store={previewStore} isAdvertised preview />
                            </div>
                        </div>
                    </section>
                    <p className="reserve-ad-preview-caption">
                        가게 목록의 일반 가게보다 먼저 보여요. 여러 광고는 최근 등록된 순서로 보여요.
                    </p>
                </div>
            )}

            <section className="reserve-ad-checkout" aria-labelledby="reserve-ad-checkout-title">
                <div className="reserve-ad-checkout__amount">
                    <h4 id="reserve-ad-checkout-title">결제할 금액</h4>
                    <strong>{won(amount)}</strong>
                </div>
                <dl className="reserve-ad-checkout__rows">
                    <div className="reserve-ad-checkout__row"><dt>가게</dt><dd>{storeName}</dd></div>
                    <div className="reserve-ad-checkout__row"><dt>광고 유형</dt><dd>{AD_TYPE_LABELS[adType]}</dd></div>
                    <div className="reserve-ad-checkout__row"><dt>노출 기간</dt><dd>{period}</dd></div>
                    <div className="reserve-ad-checkout__row">
                        <dt>요금</dt>
                        <dd>{`하루 ${won(dailyPrice)} × ${exposureDays}일`}</dd>
                    </div>
                </dl>
                <p className="reserve-ad-checkout__note">
                    {adType === 'BANNER'
                        ? '배너는 최근 등록된 활성 광고 한 개가 보여요. 여러 광고가 있으면 내 광고가 표시되지 않을 수 있어요.'
                        : '노출형 광고는 가게 목록의 일반 가게보다 먼저 보여요.'}
                    {' '}요금은 선택한 기간 기준이며, 노출 횟수·클릭 수는 보장하지 않아요.
                </p>
            </section>
        </div>
    );
};

AdCreationPreview.propTypes = {
    adType: PropTypes.oneOf(['BADGE', 'BANNER']).isRequired,
    store: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        name: PropTypes.string,
        mainImageUrl: PropTypes.string,
        category: PropTypes.string,
        description: PropTypes.string,
        rating: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        reviewCount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    }),
    copy: PropTypes.shape({
        title: PropTypes.string,
        description: PropTypes.string,
    }),
    motionKey: PropTypes.string,
    imageSrc: PropTypes.string,
    startDate: PropTypes.string.isRequired,
    endDate: PropTypes.string.isRequired,
    exposureDays: PropTypes.number.isRequired,
    dailyPrice: PropTypes.number.isRequired,
    amount: PropTypes.number.isRequired,
};

export default AdCreationPreview;
