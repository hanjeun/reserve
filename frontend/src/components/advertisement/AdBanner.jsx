import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Typography, Carousel } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { colors, radius, fontSize, fontWeight, shadows } from '../../styles/tokens';
import { getDetailImageUrl } from '../../utils/image';
import adService from '../../services/adService';
import { recordAdClick } from '../../utils/adAttribution';
import useExitAnimation from '../../hooks/useExitAnimation';
import { useWindowWidth } from '../../hooks';
import { onActivateKey } from '../../utils/a11y';

const { Text } = Typography;

/**
 * 배너형 광고 플로팅 위젯 — 화면 우측 하단에 자연스럽게 올라오는 방식(챗 위젯과 동일한 UI 패턴).
 * 사업자가 직접 업로드한 이미지(여러 장이면 자동 슬라이드, 가게 상세 캐러셀과 동일한 패턴) + 제목/설명을 노출.
 * 닫기 버튼으로 언제든 dismiss 가능. ads 배열 중 하나만 보여주고(가장 최근 결제한 것 — 백엔드가
 * OrderByCreatedAtDesc로 정렬해서 내려줌) — 여러 광고 로테이션은 1단계 범위 밖.
 *
 * 2026-07 추가: 노출/클릭 지표를 서버에 기록한다. 클릭 시에는 sessionStorage에도 함께 기록해두고
 * (recordAdClick), 나중에 같은 가게에 예약이 생성되면 useStoreDetailActions가 그 기록을 읽어 전환으로 집계한다.
 */
const AdBanner = ({ ads }) => {
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);
    // 2026-07 추가 — 모바일에서 280px 고정 폭이 화면을 너무 많이 차지해 광고가 과도하게 커 보여(스크린샷 확인),
    // 모바일(<480)에선 폭을 줄인다(220). 이미지 기준 폭도 bannerWidth를 따른다.
    const isMobile = useWindowWidth() < 480;
    const bannerWidth = isMobile ? 220 : 280;
    // 2026-07 추가: 위젯을 2:1 고정 비율로 두면 그 비율이 아닌 배너 이미지가 잘려나갔다.
    // 첫 이미지의 실제 비율을 측정해 wrapper 높이를 거기에 맞추고, objectFit: contain으로 바꿔서
    // 크롭 대신 비율이 다른 이미지에만 레터박스가 생기게 함 — 원본 이미지는 어떤 경우에도 잘리지 않는다.
    const [imgHeight, setImgHeight] = useState(140); // 이미지 로드 전 기본값(레이아웃 안정용)
    const impressionSentFor = useRef(null);

    const ad = ads && ads.length > 0 ? ads[0] : null;
    const images = ad?.imageUrls?.length > 0 ? ad.imageUrls : [];

    // 2026-07 추가 — X를 누르면 dismissed가 true되자마자 아래 return null에 걸려 즉시 언마운트되면서,
    // 진입 때는 슬라이드인 애니메이션이 재생되는데 나갈 때는 재생될 시간이 없이 턱 사라지는 문제가
    // 있었다. AddressSearch 드롭다운과 동일한 패턴(useExitAnimation)으로 닫힐 동안도 wrapper의
    // 스타일을 유지해 기존 0.35s transform/opacity transition이 그대로 재생되게 한다.
    const [dismissed, setDismissed] = useState(false);
    const { shouldRender, isClosing } = useExitAnimation(!dismissed, 350);

    useEffect(() => {
        if (!ad) return;
        // 챗 위젯처럼 페이지 진입 후 살짝 지연을 두고 슬라이드 인
        const timer = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(timer);
    }, [ad]);

    // 노출 기록(2026-07 추가) — 같은 광고가 다시 렌더링되어도(검색어 입력 등) 중복 전송하지 않도록
    // adId를 ref에 기억해둔다(페이지를 아예 떠나가 다시 들어오면 새 마운트라 다시 기록되는 건 의도된 동작).
    useEffect(() => {
        if (!ad?.id || impressionSentFor.current === ad.id) return;
        impressionSentFor.current = ad.id;
        adService.recordImpression(ad.id);
    }, [ad]);

    if (!ad || !shouldRender) return null;

    // 첫 이미지의 실제 비율을 측정해서 wrapper 높이를 그대로 따르게 함(크롭 없음).
    // 여러 장이면 이후 이미지들은 이 높이에 objectFit:contain으로 맞춰지고(비율이 다르면 레터박스).
    const handleFirstImageLoad = (e) => {
        const { naturalWidth, naturalHeight } = e.target;
        if (naturalWidth > 0) setImgHeight(Math.round(bannerWidth * (naturalHeight / naturalWidth)));
    };

    const handleBannerClick = () => {
        adService.recordClick(ad.id);
        recordAdClick(ad.id, ad.storeId);
        navigate(`/store/${ad.storeId}`);
    };

    return (
        <div
            style={{
                ...styles.wrapper,
                width: bannerWidth,
                right: isMobile ? 12 : 20,
                bottom: isMobile ? 12 : 20,
                transform: (visible && !isClosing) ? 'translateY(0)' : 'translateY(16px)',
                opacity: (visible && !isClosing) ? 1 : 0,
            }}
        >
            <style>{bannerCarouselStyles}</style>
            <button
                type="button"
                aria-label="광고 닫기"
                onClick={() => setDismissed(true)}
                className="ad-banner-close-btn"
                style={styles.closeBtn}
            >
                <CloseOutlined style={{ fontSize: 11 }} />
            </button>
            {/* 여기는 의도적으로 네이티브 <button>이 아니라 <div role="button">이다.
                (SonarCloud가 "role=button 대신 <button>을 쓰라"고 지적하지만 이 경우엔 따르면 안 된다)
                안쪽 Carousel의 점(dots)이 실제 <button> 요소라서(.slick-dots li button),
                이 영역을 <button>으로 감싸면 button 안에 button이 들어가 HTML 규격 위반이 되고
                스크린리더에서 오히려 더 나빠진다. 그래서 role+tabIndex+키보드 핸들러로 접근성을 준다.
                ReservationRow/MyStores처럼 안쪽에 인터랙티브 요소가 없는 곳은 <button>으로 바꿨다. */}
            <div
                style={styles.clickArea}
                onClick={handleBannerClick}
                onKeyDown={onActivateKey(handleBannerClick)}
                role="button"
                tabIndex={0}
                aria-label={`${ad.title} 광고 — 가게 상세로 이동`}
            >
                {images.length > 1 ? (
                    <div className="ad-banner-carousel" style={{ ...styles.imageWrapper, height: imgHeight }}>
                        <Carousel infinite draggable dotPlacement="bottom" autoplay autoplaySpeed={3500}>
                            {images.map((url, i) => (
                                <div key={url}>
                                    <img
                                        src={getDetailImageUrl(url)}
                                        alt={`${ad.title}-${i}`}
                                        style={{ ...styles.image, height: imgHeight }}
                                        onLoad={i === 0 ? handleFirstImageLoad : undefined}
                                    />
                                </div>
                            ))}
                        </Carousel>
                    </div>
                ) : (
                    <div style={{ ...styles.imageWrapper, height: imgHeight }}>
                        <img
                            src={getDetailImageUrl(images[0])}
                            alt={ad.title}
                            style={{ ...styles.image, height: imgHeight }}
                            onLoad={handleFirstImageLoad}
                        />
                    </div>
                )}
                <div style={styles.textArea}>
                    <Text style={styles.title}>{ad.title}</Text>
                    {ad.description && <Text style={styles.description}>{ad.description}</Text>}
                    <Text style={styles.adLabel}>광고 · {ad.storeName}</Text>
                </div>
            </div>
        </div>
    );
};

// 배너 위젯 안의 미니 캐러셀 — 가게 상세 캐러셀의 점(dots)/슬라이드 스타일을 축소판으로 재사용
const bannerCarouselStyles = `
  .ad-banner-carousel .ant-carousel { line-height: 0; }
  .ad-banner-carousel .slick-slide { line-height: 0; }
  .ad-banner-carousel .slick-dots { bottom: 8px !important; margin: 0 !important; }
  .ad-banner-carousel .slick-dots li { margin: 0 3px !important; }
  .ad-banner-carousel .slick-dots li button {
    width: 5px !important; height: 5px !important; border-radius: 50% !important;
    background: #fff !important; opacity: 0.6 !important; padding: 0 !important;
  }
  .ad-banner-carousel .slick-dots li.slick-active button { opacity: 1 !important; width: 12px !important; border-radius: 6px !important; }

  /* 닫기 버튼 — 우리 디자인 시스템의 Button 컴포넌트와 동일한 누르면 살짝 줄어드는 press 피드백
     (2026-07 추가 — 예전엔 raw button이라 hover/active 피드백이 전혀 없어서 누르고도 누르는 건지 알 수 없었다) */
  .ad-banner-close-btn { transition: transform 0.12s ease, background 0.12s ease; }
  .ad-banner-close-btn:hover { background: #fff !important; }
  .ad-banner-close-btn:active { transform: scale(0.88); }
`;

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
    // 2026-07 수정 — 검은 반투명 원(rgba(0,0,0,0.45)+흰 아이콘)은 우리 디자인 시스템과 달랐다 —
    // StoreCard 즐겨찾기 버튼이나 모달 close처럼 "흰/연회색 배경 + 회색 아이콘" 톤으로 통일.
    // 이미지 위에 올라서 가독성을 위해 반투명 흰 배경 + 연한 테두리로 부드럽게 띄운다.
    closeBtn: {
        position: 'absolute',
        top: 7,
        right: 7,
        zIndex: 1,
        width: 22,
        height: 22,
        borderRadius: '50%',
        border: `1px solid ${colors.border.light}`,
        background: 'rgba(255,255,255,0.92)',
        color: colors.text.secondary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        WebkitTapHighlightColor: 'transparent',
    },
    clickArea:   { cursor: 'pointer' },
    imageWrapper: { width: '100%', overflow: 'hidden', background: colors.gray[100] },
    image:       { width: '100%', objectFit: 'contain', display: 'block' },
    textArea:    { padding: '10px 12px 12px' },
    title:       { display: 'block', fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text.primary, marginBottom: 2 },
    description: { display: 'block', fontSize: fontSize.xs, color: colors.text.secondary, marginBottom: 4 },
    adLabel:     { display: 'block', fontSize: 10, color: colors.text.tertiary },
};

AdBanner.propTypes = {
    ads: PropTypes.arrayOf(PropTypes.shape({
        storeId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        storeName: PropTypes.string,
        imageUrls: PropTypes.arrayOf(PropTypes.string),
        title: PropTypes.string,
        description: PropTypes.string,
    })),
};

export default AdBanner;
