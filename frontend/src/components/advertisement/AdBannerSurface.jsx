import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import AdMark from './AdMark';

const { Text } = Typography;

const oneLine = {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

/** 운영 배너와 결제 직전 미리보기가 공유하는 단일 시각 표면. */
const AdBannerSurface = ({ ad, imageSrc, interactive = true, onActivate, onClose }) => (
    <>
        {interactive ? (
            <button
                type="button"
                aria-label="광고 닫기"
                onClick={onClose}
                className="ad-banner-close-btn"
                style={styles.closeBtn}
            >
                <CloseOutlined aria-hidden="true" style={{ fontSize: 20 }} />
            </button>
        ) : (
            <span className="ad-banner-close-btn" style={styles.closeBtn} aria-hidden="true">
                <CloseOutlined style={{ fontSize: 20 }} />
            </span>
        )}
        <button
            type="button"
            className="ad-banner-click-area"
            style={styles.clickArea}
            onClick={interactive ? onActivate : undefined}
            aria-label={`${ad.title} 광고 — ${interactive ? '가게 상세로 이동' : '눌림 효과 미리보기'}`}
        >
            <BannerContent ad={ad} imageSrc={imageSrc} />
        </button>
    </>
);

const BannerContent = ({ ad, imageSrc }) => (
    <>
        <span style={styles.imageWrapper}>
            <img
                className="reserve-ad-banner-image"
                src={imageSrc}
                alt={`${ad.storeName} 광고 이미지`}
                width="80"
                height="80"
                style={styles.image}
            />
        </span>
        <span style={styles.textArea}>
            <Text style={styles.title}>{ad.title}</Text>
            <Text style={styles.description}>{ad.description}</Text>
            <Text style={styles.adLabel}><AdMark /> · {ad.storeName}</Text>
        </span>
    </>
);

const adShape = PropTypes.shape({
    storeName: PropTypes.string,
    title: PropTypes.string,
    description: PropTypes.string,
});

AdBannerSurface.propTypes = {
    ad: adShape.isRequired,
    imageSrc: PropTypes.string.isRequired,
    interactive: PropTypes.bool,
    onActivate: PropTypes.func,
    onClose: PropTypes.func,
};

BannerContent.propTypes = {
    ad: adShape.isRequired,
    imageSrc: PropTypes.string.isRequired,
};

const styles = {
    closeBtn: {
        position: 'absolute',
        top: 4,
        right: 4,
        zIndex: 1,
        width: 44,
        height: 44,
        borderRadius: 12,
        border: 'none',
        background: 'transparent',
        color: colors.text.secondary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
    },
    clickArea: {
        display: 'grid',
        width: '100%',
        minWidth: 0,
        gridTemplateColumns: '80px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 12,
        padding: '10px 56px 10px 10px',
        border: 0,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
    },
    imageWrapper: {
        display: 'block',
        width: 80,
        height: 80,
        overflow: 'hidden',
        borderRadius: 16,
        background: colors.gray[100],
    },
    image: {
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    textArea: { display: 'block', minWidth: 0 },
    title: {
        ...oneLine,
        fontSize: fontSize.sm,
        lineHeight: '21px',
        fontWeight: fontWeight.bold,
        color: colors.text.primary,
        marginBottom: 2,
    },
    description: {
        ...oneLine,
        fontSize: fontSize.sm,
        lineHeight: '20px',
        fontWeight: fontWeight.semibold,
        color: colors.primary.main,
        marginBottom: 5,
    },
    adLabel: {
        ...oneLine,
        fontSize: 10,
        lineHeight: '15px',
        color: colors.text.tertiary,
    },
};

export default AdBannerSurface;
