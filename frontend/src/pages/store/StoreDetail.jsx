import { PageTitle } from '../../components/common/PageTypography';
import PhotoGallery from '../../components/common/PhotoGallery';
import WaitingJoin from '../../components/waiting/WaitingJoin';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { breakpoints, colors, radius, fontWeight } from '../../styles/tokens';

import { ReservationPanel } from '../../components/reservation/StoreReservationPanel';
import AdmissionModal from '../../components/reservation/AdmissionModal';
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
                    {!preview && <FavoriteButton storeId={store.id} appearance="plain" inactiveColor={colors.text.primary} />}
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

// 날짜별 서버 잔여 수로 시간 선택지를 구성한다.

// 공개 정원에는 현재 예약도 포함되므로 검증된 수정 예약의 원래 가게·날짜·시간만 정원 표시를 예외 처리한다.
// 조회에 성공한 시간 목록에 해당 시각이 있어야 한다.
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
            {/*
             * 리뷰를 예약 폼의 고정 범위 밖에 두어 리뷰 길이가 폼의 고정 시간을 늘리지 않게 한다.
             */}
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
    const [searchParams] = useSearchParams();
    // /store/abc 처럼 숫자가 아닌 id 는 API 에 보내지 않는다 — 보내면 400 이 와서
    // "요청을 처리할 수 없습니다 · 다시 불러오기" 라는, 다시 눌러도 낫지 않는 오류로 보였다.
    const validId = /^\d+$/.test(id ?? '') && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    const navigate = useNavigate();
    const { message } = useMessage();
    const { isLoggedIn, user } = useAuthStore();
    const { pay, paying } = usePayment();
    const { store, loading, error, refetch } = useStoreData(validId ? id : null, { reservationId: searchParams.get('edit') });
    // 사진 순서·메타데이터 변경은 문서·브라우저 힌트보다 새 공개 응답을 우선한다.
    useEffect(() => {
        if ([401, 403, 404, 410].includes(httpStatusOf(error))) forgetImageHint(id);
        else if (store) rememberImageHints(store);
    }, [store, error, id]);
    const [form] = Form.useForm();
    const reservationDate = Form.useWatch('reservationDate', form);
    const reservationTime = Form.useWatch('reservationTime', form);
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

    // 우리동네 표시는 목록·카드와 같은 위치 우선순위를 사용한다.
    // 동네 표시는 저장된 주소를 먼저 쓰고 없으면 현재 세션 위치를 사용한다.

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
        admissionModalProps,
        reservationSubmitting,
        reservationEntry,
        isEditMode,
        editingReservation,
        editLoadError,
        editRetrying,
        retryEditLoad,
    } = useStoreDetailActions({ id, store, isLoggedIn, user, form, pay, message, reservationDate, reservationTime });

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
    // 사진 복제본은 제외하고 실제 사진 목록만 미리보기에 전달한다.

    // 캐러셀 반복은 유지하고 미리보기용 원본 목록을 별도로 구성한다.

    const nearby = isNearby(nearbyUserLocation, store.latitude, store.longitude, store.nearbyRadiusKm ?? undefined);
    const identityProps = { store, nearby, canContact: user?.id !== store.ownerId, onContact: handleStoreContact };
    const panelProps = {
        store, form, onFinish, paying: paying || reservationSubmitting, reservationEntry, isEditMode, editingReservation,
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
            <AdmissionModal {...admissionModalProps} />

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
