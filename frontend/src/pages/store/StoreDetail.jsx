import { PageTitle } from '../../components/common/PageTypography';
import PhotoGallery from '../../components/common/PhotoGallery';
import WaitingJoin from '../../components/waiting/WaitingJoin';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { Typography, Form, Divider } from 'antd';
import { StarFilled, MessageOutlined, PhoneOutlined } from '../../components/common/icons';
import { PageContainer, Button, DataState, FavoriteButton, Badge, KakaoMap, Tooltip } from '../../components/common';
import StoreDetailLoading from '../../components/store/StoreDetailLoading';
import StoreIdentityText from '../../components/store/StoreIdentityText';
import StoreInfoSection from '../../components/store/StoreInfoSection';
import { ReviewList } from '../../components/review';
import { useStoreData, useMessage, usePayment, useWindowWidth, useStoreDetailActions } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { rememberImageHints, forgetImageHint } from '../../utils/imageHintCache';
import { storeGalleryImages } from '../../utils/storeImages';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { getDetailImageUrl } from '../../utils';
import { isNearby } from '../../utils/distance';
import { normalizeStoreRating } from '../../utils/storeRating';
import useLocationStore from '../../store/useLocationStore';
import useMessengerStore from '../../store/useMessengerStore';
import { breakpoints, radius, fontWeight } from '../../styles/tokens';

import { ReservationPanel } from '../../components/reservation/StoreReservationPanel';
const { Title } = Typography;
export { ReservationPanel, TimeSlotPicker } from '../../components/reservation/StoreReservationPanel';

const BREAKPOINT = 900;

// 인원 수 입력 스텝퍼
export { StoreInfoSection };

// PC·모바일의 가게명/평점/소개/빠른 연락은 같은 구조를 사용한다.
export const StoreIdentity = ({ store, nearby, canContact, onContact, preview = false }) => {
    const { rating, reviewCount } = normalizeStoreRating(store.rating, store.reviewCount);
    const dialNumber = String(store.phone ?? '').replace(/[^+\d]/g, '');
    return (
        <div className="reserve-store-identity">
            <div className="reserve-store-identity-title-row">
                <PageTitle level={1}>{store.name}</PageTitle>
                <fieldset className="reserve-store-identity-actions" aria-label="가게 빠른 작업" style={{ border: 0, padding: 0, minWidth: 0, marginInline: 0 }}>
                    {!preview && <FavoriteButton storeId={store.id} appearance="plain" />}
                    {canContact && onContact && (
                        <Tooltip title="가게에 채팅 문의하기"><button type="button" className="reserve-store-contact-action reserve-icon-tool" data-icon-kind="navigation"
                            onClick={onContact} aria-label="가게에 채팅 문의하기">
                            <MessageOutlined aria-hidden="true" />
                        </button></Tooltip>
                    )}
                    {canContact && dialNumber && (
                        <Tooltip title={`전화 ${store.phone}`}><a className="reserve-store-contact-action reserve-icon-tool" data-icon-kind="navigation" href={`tel:${dialNumber}`}
                            aria-label={`가게에 전화하기 ${store.phone}`}>
                            <PhoneOutlined aria-hidden="true" />
                        </a></Tooltip>
                    )}
                </fieldset>
            </div>
            <div className="reserve-store-identity-rating">
                <StarFilled aria-hidden="true" />
                <strong>{rating.toFixed(1)}</strong>
                <span>({reviewCount.toLocaleString('ko-KR')})</span>
            </div>
            <div className="reserve-store-identity-summary">
                <StoreIdentityText category={store.category} nearby={nearby} />
                {store.description && <><span className="reserve-store-identity-separator" aria-hidden="true">·</span><p className="reserve-store-identity-description">{store.description}</p></>}
            </div>
            {store.keywords?.length > 0 && (
                <div className="reserve-store-identity-tags">
                    {store.keywords.map(kw => <Badge key={kw} variant="keyword" style={styles.identityBadge}>{kw}</Badge>)}
                </div>
            )}
        </div>
    );
};

// 예약 시간 선택 — 날짜 선택 시 GET /api/reservations/availability 조회해서 슬롯별 실시간 잔여 인원을 반영한 필 그리드로 보여준다.
// AntD FormTimePicker(시/분 스크롤 휠) 대신 네이버 예약 스타일의 pill 그리드 + scaleSpringIn 토큰으로 대체.
// Public availability includes the current reservation in capacity totals. Only the already-validated
// edit's original store/date/time may ignore that flag; the time must still exist in a successful response.
const resolveNearbyUserLocation = (user, liveLocation) => ((user?.latitude != null && user?.longitude != null)
    ? { latitude: user.latitude, longitude: user.longitude }
    : liveLocation);

const storeDocumentDescription = (store) => {
    if (!store) return undefined;
    const categoryPart = store.category ? store.category + ' ' : '';
    const addressPart = store.address ? store.address + '. ' : '';
    return `${store.name} 예약 | ${categoryPart}${addressPart}RESERVE에서 간편하게 예약하세요.`;
};

const StoreNotFound = ({ error, onRetry, onGoToList }) => (
    <DataState
        state={error ? 'error' : 'empty'}
        requestType="detail"
        kind="store"
        subject="가게 정보"
        error={error}
        title={error ? undefined : '요청하신 가게를 찾을 수 없어요.'}
        onRetry={error ? onRetry : undefined}
        missingAction={<Button variant="ghost" size="sm" onClick={onGoToList}>가게 목록으로</Button>}
        style={{ marginTop: 100 }}
    />
);

// 상세 이미지 캐러셀 — PC·모바일이 래퍼/이미지 스타일만 다르고 구조는 같다.
const storeDetailImageUrl = (url, preview) => preview && url?.startsWith('blob:') ? url : getDetailImageUrl(url);
const StoreImageCarousel = ({ store, storeName, sliderImages, autoplay, wrapperStyle, imageStyle, preview = false }) => {
    const sources = sliderImages.map(url => storeDetailImageUrl(url, preview));
    const metadata = storeGalleryImages(store);
    const imageSizes = sliderImages.map(url => metadata.find(image => image.url === url));
    return <PhotoGallery label={storeName} sources={sources} autoplay={autoplay}
        imageSizes={imageSizes}
        wrapperStyle={wrapperStyle} imageStyle={imageStyle} previewEnabled={!preview} />;
};

const StoreReviewSection = ({ sectionRef, isPC, ...reviewListProps }) => (
    <section ref={sectionRef}>
        <Title level={3} style={styles.sectionTitle}>리뷰</Title>
        <ReviewList {...reviewListProps} isPC={isPC} />
    </section>
);

export const StoreDetailPCLayout = ({ sliderImages, identityProps, panelProps, reviewProps, preview = false, infoContent }) => {
    const { store } = identityProps;
    const showPanel = !preview || store.reservationEnabled !== false;
    return (
        <>
            <div style={showPanel ? styles.pcGrid : { ...styles.pcGrid, justifyContent: 'center' }}>
                <div style={showPanel ? styles.pcLeft : { ...styles.pcLeft, flex: 1, maxWidth: 640 }}>
                    <StoreImageCarousel store={store} storeName={store.name} sliderImages={sliderImages}
                        autoplay={!preview && store.imageAutoplayEnabled !== false} preview={preview}
                        wrapperStyle={styles.pcImageWrapper} imageStyle={styles.pcMainImg} />
                    <StoreIdentity {...identityProps} preview={preview} />
                    {infoContent ?? <StoreInfoSection store={store} />}
                    {!preview && <div style={{ marginTop: 20, marginBottom: 8 }}>
                        <KakaoMap latitude={store.latitude} longitude={store.longitude}
                            address={store.address} storeName={store.name} height={220} />
                    </div>}
                </div>
                {showPanel && <div style={styles.pcRight}>
                    {store.reservationEnabled !== false && <ReservationPanel {...panelProps} isPC={true} preview={preview} />}
                    {!preview && <WaitingJoin key={store.id} store={store} isPC />}
                </div>}
            </div>
            {/* 리뷰 섹션을 2단 레이아웃(pcGrid) 밖으로 분리(2026-07) — 예전엔 pcLeft 안에 있어서
                예약 폼의 sticky 범위(부모 행 pcGrid가 다 스크롤될 때까지 폼이 화면에 붙어있음)가
                리뷰 개수만큼 계속 늘어나, 리뷰가 많은 가게일수록 폼이 오래 "고정"된 채로 남아있었다.
                풀와이드 섹션으로 빼서 sticky 범위를 갤러리+정보+지도까지로 줄이고, 리뷰는 더 넓은
                폭(540→720)으로 보여준다. 폭은 취향껏 다시 조정 가능. */}
            {!preview && <><Divider style={styles.divider} /><StoreReviewSection {...reviewProps} isPC /></>}
        </>
    );
};

export const StoreDetailMobileLayout = ({ sliderImages, identityProps, panelProps, reviewProps, preview = false, infoContent }) => {
    const { store } = identityProps;
    const showPanel = !preview || store.reservationEnabled !== false;
    return (
        <>
            <section style={{ padding: 0 }}>
                <StoreImageCarousel store={store} storeName={store.name} sliderImages={sliderImages}
                    autoplay={!preview && store.imageAutoplayEnabled !== false} preview={preview}
                    wrapperStyle={styles.mobileImageWrapper} imageStyle={styles.mainImg} />
                <div>
                    <StoreIdentity {...identityProps} preview={preview} />
                </div>
            </section>
            <div>
                {infoContent ?? <StoreInfoSection store={store} />}
                {!preview && <div style={{ marginTop: 16, marginBottom: 8 }}>
                    <KakaoMap latitude={store.latitude} longitude={store.longitude}
                        address={store.address} storeName={store.name} height={200} />
                </div>}
            </div>
            {showPanel && <>
                <Divider style={styles.divider} />
                <section>
                    {store.reservationEnabled !== false && <ReservationPanel {...panelProps} isPC={false} preview={preview} />}
                    {!preview && <WaitingJoin key={store.id} store={store} isPC={false} />}
                </section>
            </>}
            {!preview && <><Divider style={styles.divider} /><StoreReviewSection {...reviewProps} isPC={false} /></>}
        </>
    );
};

const StoreDetail = () => {
    const { id } = useParams();
    // /store/abc 처럼 숫자가 아닌 id 는 API 에 보내지 않는다 — 보내면 400 이 와서
    // "요청을 처리할 수 없습니다 · 다시 불러오기" 라는, 다시 눌러도 낫지 않는 오류로 보였다.
    const validId = /^\d+$/.test(id ?? '') && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    const navigate = useNavigate();
    const { message } = useMessage();
    const { isLoggedIn, user } = useAuthStore();
    const { pay, paying } = usePayment();
    const { store, loading, error, refetch } = useStoreData(validId ? id : null);
    // Public responses supersede the document/browser hint, including photo reorder and missing metadata.
    useEffect(() => {
        if ([401, 403, 404, 410].includes(httpStatusOf(error))) forgetImageHint(id);
        else if (store) rememberImageHints(store);
    }, [store, error, id]);
    const [form] = Form.useForm();
    const windowWidth = useWindowWidth();
    const isPC = windowWidth >= BREAKPOINT;
    const openStoreMessenger = useMessengerStore((state) => state.openStore);

    const handleStoreContact = () => {
        const target = `/messages?storeId=${id}`;
        // 모바일은 브라우저 뒤로가기가 자연스러운 전체 페이지, 태블릿 이상은 현재 맥락을
        // 유지하는 오른쪽 패널을 쓴다. 비로그인은 PrivateRoute를 거쳐 로그인 뒤 돌아온다.
        if (!isLoggedIn || user?.termsAgreed === false || useAuthStore.getState().isLoggingOut
            || window.innerWidth < breakpoints.tablet) navigate(target);
        else openStoreMessenger(Number(id));
    };

    // "우리동네" 배지 — StoreCard/StoreList와 동일한 원칙 및 우선순위(2026-07 수정):
    // 마이페이지에 저장된 위치가 있으면 그게 최우선이고, 없을 때만 이 세션에서 얻은 라이브 위치로
    // 폴백한다. "우리동네"는 사용자가 사는/자주 가는 동네라는 안정적인 개념이라, 거리순 정렬을
    // 한 번 눌러서 라이브 위치 권한을 허용했다고 그 뒤로 계속 그 위치 기준으로 바뀌면 안 된다
    // (예: 마이페이지엔 청와대로 저장해뒀는데 안산에서 거리순 한 번 누르면 그 뒤로는 별점순으로
    // 바꿔도 안산 근처 가게만 "우리동네"로 뜨는 문제 — StoreList.jsx의 nearbyUserLocation 참고).
    const { liveLocation } = useLocationStore();
    const nearbyUserLocation = resolveNearbyUserLocation(user, liveLocation);

    const {
        completedReservation,
        reviewEligibilityError,
        reviewEligibilityLoading,
        refetchReviewEligibility,
        stateOpenWrite,
        stateOpenReviewId,
        reviewSectionRef,
        onFinish,
        isEditMode,
        editingReservation,
        editLoadError,
        editRetrying,
        retryEditLoad,
    } = useStoreDetailActions({ id, store, isLoggedIn, user, form, pay, message });

    useDocumentTitle(store?.name ?? null, storeDocumentDescription(store));

    // PC·모바일 뒤로가기는 데이터 로딩과 무관하게 공통 Header에서 제공한다.

    const containerSize = isPC ? 'xl' : 'md';
    const paddingTop = isPC ? '32px' : '20px';

    if (loading) return <StoreDetailLoading storeId={id} isPC={isPC} />;
    if (!store) return (
        <PageContainer size={containerSize} paddingTop={paddingTop}>
            <StoreNotFound error={error} onRetry={refetch} onGoToList={() => navigate('/stores')} />
        </PageContainer>
    );

    const sliderImages = storeGalleryImages(store).map(image => image.url);
    // ★ 2026-08-06 — 프리뷰에 "3 / 4" 처럼 실제보다 많은 장수가 뜨던 버그
    //   react-slick 은 infinite 루프를 위해 앞뒤 슬라이드를 **복제**한다(.slick-cloned).
    //   복제본도 진짜 <Image> 라서 Image.PreviewGroup 이 그것까지 수집한다 →
    //   사진 2장을 넣으면 프리뷰가 4장으로 잡히고, 넘겨도 같은 사진이 반복돼
    //   "스와이프가 안 먹는다"처럼 보인다.
    //   ★ 2026-08-06 2차 — 처음엔 infinite 를 껐다. 그랬더니 더 나쁜 증상이 생겼다:
    //   사진 2장 + autoplay 면 캐러셀이 **마지막 장에 멈춰** 있고, 그 상태에서 왼쪽으로
    //   쓸면(= 다음 장) 갈 곳이 없어 아무 일도 안 일어난다 → "스와이프가 안 된다"로 보인다.
    //   (실측: 오른쪽 쓸기는 1→0 으로 정상 동작했다. 즉 스와이프 자체는 멀쩡했다.)
    //   → infinite 는 되살리고, 장수 문제는 PreviewGroup 에 items 를 명시해서 푼다.
    //     items 를 주면 AntD 가 자식 <Image> 를 수집하지 않으므로 복제본이 섞이지 않는다.
    const nearby = isNearby(nearbyUserLocation, store.latitude, store.longitude, store.nearbyRadiusKm ?? undefined);
    const identityProps = { store, nearby, canContact: user?.id !== store.ownerId, onContact: handleStoreContact };
    const panelProps = {
        store, form, onFinish, paying, isEditMode, editingReservation,
        editLoadError, editRetrying, onRetryEditLoad: retryEditLoad,
    };
    const reviewProps = {
        sectionRef: reviewSectionRef,
        storeId: Number(id),
        completedReservation,
        completedReservationError: reviewEligibilityError,
        completedReservationRetrying: reviewEligibilityLoading,
        onCompletedReservationRetry: refetchReviewEligibility,
        autoOpenWrite: stateOpenWrite,
        focusReviewId: stateOpenReviewId,
    };

    return (
        <PageContainer className="reserve-store-detail" size={containerSize} paddingTop={paddingTop}>

            {isPC ? (
                <StoreDetailPCLayout sliderImages={sliderImages} identityProps={identityProps}
                    panelProps={panelProps} reviewProps={reviewProps} />
            ) : (
                <StoreDetailMobileLayout sliderImages={sliderImages} identityProps={identityProps}
                    panelProps={panelProps} reviewProps={reviewProps} />
            )}
        </PageContainer>
    );
};

const styles = {
    identityBadge:    { marginRight: 0, marginBottom: 0 },
    divider:          { margin: '24px 0' },
    sectionTitle:     { marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold },
    mainImg:          { width: '100%', height: 'auto', display: 'block' },
    pcGrid:           { display: 'flex', gap: 36, alignItems: 'flex-start' },
    pcLeft:           { flex: '0 0 50%', minWidth: 0, maxWidth: 560 },
    pcRight:          { flex: 1, minWidth: 320, maxWidth: 440, position: 'sticky', top: 80, alignSelf: 'flex-start' },
    pcImageWrapper:   { width: '100%', overflow: 'hidden', borderRadius: radius.xl, lineHeight: 0 }, 
    pcMainImg:        { width: '100%', height: 'auto', display: 'block' },
    mobileImageWrapper: { width: '100%', overflow: 'hidden', marginBottom: 0, lineHeight: 0, borderRadius: radius.xl }, 
    
};

export default StoreDetail;
