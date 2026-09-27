import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../styles/tokens';
import { getDetailImageUrl } from '../../utils/image';
import adService from '../../services/adService';
import { recordAdClick } from '../../utils/adAttribution';
import useExitAnimation from '../../hooks/useExitAnimation';
import { useReducedMotion } from '../../hooks';
import { normalizeBannerMotionKey } from '../../constants';
import AdBannerSurface from './AdBannerSurface';

const motionDuration = key => key === 'TILT_UP_3D' ? 620 : 420;

/** 한 줄 제목·내용과 정사각 대표 이미지 한 장을 쓰는 가로형 플로팅 광고. */
const AdBanner = ({ ads }) => {
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const prefersReducedMotion = useReducedMotion();
    const impressionSentFor = useRef(null);
    const ad = ads && ads.length > 0 ? ads[0] : null;
    const adId = ad?.id;
    const motionKey = normalizeBannerMotionKey(ad?.bannerMotionKey);
    const bannerMotionMs = motionDuration(motionKey);
    const imageUrl = ad?.imageUrls?.[0];
    const { shouldRender, isClosing } = useExitAnimation(
        !dismissed,
        prefersReducedMotion ? 0 : bannerMotionMs,
    );

    useEffect(() => {
        if (!adId) return undefined;
        const timer = setTimeout(() => setVisible(true), prefersReducedMotion ? 0 : 800);
        return () => clearTimeout(timer);
    }, [adId, prefersReducedMotion]);

    useEffect(() => {
        if (!ad?.id || impressionSentFor.current === ad.id) return;
        impressionSentFor.current = ad.id;
        adService.recordImpression(ad.id);
    }, [ad]);

    if (!ad || !shouldRender) return null;

    const shown = visible && !isClosing;
    const tilt3d = motionKey === 'TILT_UP_3D';
    const hiddenTransform = tilt3d
        ? 'perspective(900px) translate3d(0, 30px, 0) rotateX(78deg) scale(0.94)'
        : 'translateY(28px) scale(0.92)';
    const shownTransform = tilt3d
        ? 'perspective(900px) translate3d(0, 0, 0) rotateX(0deg) scale(1)'
        : 'translateY(0) scale(1)';

    const handleBannerClick = () => {
        adService.recordClick(ad.id);
        recordAdClick(ad.id, ad.storeId);
        navigate(`/store/${ad.storeId}`);
    };

    return (
        <aside
            className={`reserve-ad-banner reserve-ad-banner--${motionKey.toLowerCase().replaceAll('_', '-')}`}
            data-motion={motionKey}
            aria-label="추천 광고"
            style={{
                ...styles.wrapper,
                transform: shown ? shownTransform : hiddenTransform,
                opacity: shown ? 1 : 0,
                animation: !prefersReducedMotion && shown && tilt3d
                    ? `reserve-ad-banner-tilt-up ${bannerMotionMs}ms cubic-bezier(0.18, 0.82, 0.24, 1) both`
                    : 'none',
                transition: prefersReducedMotion || (shown && tilt3d)
                    ? 'none'
                    : `transform ${bannerMotionMs}ms cubic-bezier(0.16, 1.32, 0.3, 1), opacity 0.22s ease-out`,
            }}
        >
            <AdBannerSurface
                ad={ad}
                imageSrc={getDetailImageUrl(imageUrl)}
                onActivate={handleBannerClick}
                onClose={() => setDismissed(true)}
            />
        </aside>
    );
};

const styles = {
    wrapper: {
        position: 'fixed',
        right: 12,
        bottom: 12,
        width: 'min(360px, calc(100vw - 24px))',
        minHeight: 100,
        boxSizing: 'border-box',
        background: colors.background.paper,
        borderRadius: 20,
        border: `1px solid ${colors.border.light}`,
        boxShadow: '0 14px 36px rgba(0,0,0,0.16)',
        overflow: 'hidden',
        zIndex: 900,
        transformOrigin: '50% 100%',
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
        willChange: 'transform, opacity',
    },
};

AdBanner.propTypes = {
    ads: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        storeId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        storeName: PropTypes.string,
        imageUrls: PropTypes.arrayOf(PropTypes.string),
        title: PropTypes.string,
        description: PropTypes.string,
        bannerMotionKey: PropTypes.string,
    })),
};

export default AdBanner;
