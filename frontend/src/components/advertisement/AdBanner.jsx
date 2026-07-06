import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { colors, radius, fontSize, fontWeight, shadows } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 배너형 광고 플로팅 위젯 — 화면 우측 하단에 자연스럽게 올라오는 방식(챗 위젯과 동일한 UI 패턴).
 * 사업자가 직접 업로드한 이미지 + 제목/설명을 그대로 노출. 닫기 버튼으로 언제든 dismiss 가능.
 * ads 배열 중 하나만 보여주고(가장 최근 것), 여러 개면 몇 초 간격으로 로테이션은 1단계 범위 밖.
 */
const AdBanner = ({ ads }) => {
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const ad = ads && ads.length > 0 ? ads[0] : null;

    useEffect(() => {
        if (!ad) return;
        // 챗 위젯처럼 페이지 진입 후 살짝 지연을 두고 슬라이드 인
        const timer = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(timer);
    }, [ad]);

    if (!ad || dismissed) return null;

    return (
        <div
            style={{
                ...styles.wrapper,
                transform: visible ? 'translateY(0)' : 'translateY(16px)',
                opacity: visible ? 1 : 0,
            }}
        >
            <button
                type="button"
                aria-label="광고 닫기"
                onClick={() => setDismissed(true)}
                style={styles.closeBtn}
            >
                <CloseOutlined style={{ fontSize: 12 }} />
            </button>
            <div style={styles.clickArea} onClick={() => navigate(`/store/${ad.storeId}`)}>
                <img src={ad.imageUrl} alt={ad.title} style={styles.image} />
                <div style={styles.textArea}>
                    <Text style={styles.title}>{ad.title}</Text>
                    {ad.description && <Text style={styles.description}>{ad.description}</Text>}
                    <Text style={styles.adLabel}>광고 · {ad.storeName}</Text>
                </div>
            </div>
        </div>
    );
};

const styles = {
    wrapper: {
        position: 'fixed',
        right: 20,
        bottom: 20,
        width: 280,
        background: '#fff',
        borderRadius: radius.xl,
        boxShadow: shadows?.cardHover || '0 8px 24px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        zIndex: 900,
        transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease',
    },
    closeBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        zIndex: 1,
        width: 22,
        height: 22,
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    },
    clickArea: { cursor: 'pointer' },
    image:     { width: '100%', height: 140, objectFit: 'cover', display: 'block' },
    textArea:  { padding: '10px 12px 12px' },
    title:       { display: 'block', fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text.primary, marginBottom: 2 },
    description: { display: 'block', fontSize: fontSize.xs, color: colors.text.secondary, marginBottom: 4 },
    adLabel:     { display: 'block', fontSize: 10, color: colors.text.tertiary },
};

AdBanner.propTypes = {
    ads: PropTypes.arrayOf(PropTypes.shape({
        storeId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        storeName: PropTypes.string,
        imageUrl: PropTypes.string,
        title: PropTypes.string,
        description: PropTypes.string,
    })),
};

export default AdBanner;
