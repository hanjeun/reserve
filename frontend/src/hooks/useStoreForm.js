import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { storeService } from '../services';
import useMessage from './useMessage';
import useAuthStore from '../store/useAuthStore';
import useStoreDraftPreferences, { getStoreDraftAutoSaveEnabled } from './useStoreDraftPreferences';
import { buildStoreFormData } from '../utils/form';
import { handleApiError } from '../utils/errorHandler';
import { getDetailImageUrl } from '../utils/image';
import {
    deleteStoreDraft,
    fingerprintStoreDraftBase,
    hydrateDraftImages,
    hydrateStoreFormValues,
    makeStoreDraftKey,
    purgeExpiredStoreDrafts,
    readStoreDraft,
    saveStoreDraft,
    serializeDraftImages,
    serializeStoreFormValues,
} from '../utils/storeDraftStorage';
import { clearRegistrationNavigation, readRegistrationNavigation, rememberRegistrationNavigation } from '../utils/storeRegistrationNavigation';
import { invalidateStoreData } from './invalidateAfterWrite';

const AUTO_SAVE_IDLE_MS = 1000;
const AUTO_SAVE_MAX_WAIT_MS = 5000;
const parseTime = value => (value ? dayjs(`2000-01-01T${value}:00`) : null);

const initialValuesFromStore = initialData => {
    if (!initialData) return {};
    return {
        name: initialData.name,
        category: initialData.category,
        serviceDomain: initialData.serviceDomain,
        address: initialData.address,
        zipCode: initialData.zipCode ?? '',
        addressDetail: initialData.addressDetail ?? '',
        latitude: initialData.latitude ?? undefined,
        longitude: initialData.longitude ?? undefined,
        phone: initialData.phone,
        description: initialData.description,
        noShowDeposit: initialData.noShowDeposit,
        reservationEnabled: initialData.reservationEnabled !== false,
        maxCapacityPerSlot: initialData.maxCapacityPerSlot ?? undefined,
        autoApprovalEnabled: initialData.autoApprovalEnabled ?? false,
        allowLatePayment: initialData.allowLatePayment ?? false,
        allowDuplicateReservation: initialData.allowDuplicateReservation ?? false,
        emailNotificationEnabled: initialData.emailNotificationEnabled ?? true,
        imageAutoplayEnabled: initialData.imageAutoplayEnabled ?? true,
        waitingIntakeMode: initialData.waitingIntakeMode ?? 'OFF',
        fullRefundDays: initialData.fullRefundDays ?? 3,
        partialRefundDays: initialData.partialRefundDays ?? 1,
        partialRefundRate: initialData.partialRefundRate ?? 50,
        bookingDeadlineHours: initialData.bookingDeadlineHours ?? undefined,
        paymentTimeoutMinutes: initialData.paymentTimeoutMinutes ?? 30,
        reservationSlotMinutes: initialData.reservationSlotMinutes ?? 30,
        nearbyRadiusKm: initialData.nearbyRadiusKm ?? 3,
        closedDays: initialData.closedDays ?? [],
        closedDates: (initialData.closedDates ?? []).map(date => dayjs(date)),
        maxAdvanceBookingDays: initialData.maxAdvanceBookingDays ?? undefined,
        bookingType: initialData.bookingType ?? 'SLOT',
        sessionTimes: (initialData.sessionTimes ?? []).map(parseTime),
        operatingPeriod: (initialData.openDate || initialData.closeDate)
            ? [initialData.openDate ? dayjs(initialData.openDate) : null,
                initialData.closeDate ? dayjs(initialData.closeDate) : null]
            : null,
        times: initialData.openTime && initialData.closeTime
            ? [parseTime(initialData.openTime), parseTime(initialData.closeTime)]
            : null,
        breakTimes: initialData.breakStartTime && initialData.breakEndTime
            ? [parseTime(initialData.breakStartTime), parseTime(initialData.breakEndTime)]
            : null,
    };
};

const existingImagesFromStore = initialData => {
    const mainImage = initialData?.mainImageUrl ? [{
        uid: '-1',
        name: 'main-image',
        status: 'done',
        url: getDetailImageUrl(initialData.mainImageUrl),
        existingUrl: initialData.mainImageUrl,
    }] : [];

    const detailImages = (initialData?.detailImageUrls ?? []).map((url, index) => ({
        uid: `-detail-${index}`,
        name: `detail-image-${index}`,
        status: 'done',
        url: getDetailImageUrl(url),
        existingUrl: url,
    }));

    return { mainImage, detailImages };
};

const draftFailureMessage = error => {
    if (error?.name === 'QuotaExceededError') {
        return '브라우저 저장 공간이 부족해 임시저장하지 못했어요. 새 이미지 수나 크기를 줄여주세요.';
    }
    return error?.message || '이 브라우저에 임시저장하지 못했어요.';
};

/** StoreRegister, StoreEdit에서 공유하는 폼·이미지·로컬 임시저장 로직 */
export const useStoreForm = ({
    mode = 'create',
    initialData = null,
    storeId = null,
    form,
    formReady = true,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { message, confirm } = useMessage();
    const user = useAuthStore(state => state.user);
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const userId = user?.id;
    const { autoSaveEnabled } = useStoreDraftPreferences(user);
    const [loading, setLoading] = useState(false);
    const [mainImage, setMainImage] = useState([]);
    const [detailImages, setDetailImages] = useState([]);
    const [draftState, setDraftState] = useState({ status: 'idle', savedAt: null, error: null });

    const draftKey = makeStoreDraftKey({ userId, mode, storeId });
    const navigationKey = `${draftKey}:${sessionRevision}:${location.key}`;
    const navigationCompletedRef = useRef(false);
    const draftStateRef = useRef(draftState);
    const mainImageRef = useRef([]);
    const detailImagesRef = useRef([]);
    const baseFingerprintRef = useRef(null);
    const autoSaveTimerRef = useRef(null);
    const autoSaveMaxTimerRef = useRef(null);
    const autoSaveActiveRef = useRef(false);
    const saveQueueRef = useRef(Promise.resolve());
    const saveSequenceRef = useRef(0);
    const restoredKeyRef = useRef(/** @type {string | null} */ (null));
    const initializedEditKeyRef = useRef(/** @type {string | null} */ (null));
    const restoredObjectUrlsRef = useRef(new Set());
    const hasChangesRef = useRef(false);
    const mountedRef = useRef(true);
    const draftSessionRef = useRef({ userId, role: user?.role, sessionRevision });
    const confirmRef = useRef(confirm);
    useEffect(() => { confirmRef.current = confirm; }, [confirm]);
    useEffect(() => { draftStateRef.current = draftState; }, [draftState]);

    const isCurrentDraftSession = useCallback(() => {
        const auth = useAuthStore.getState();
        const started = draftSessionRef.current;
        return started.userId != null
            && auth.user?.id === started.userId
            && auth.user?.role === started.role
            && auth.sessionRevision === started.sessionRevision;
    }, []);

    useEffect(() => () => {
        if (mode !== 'create' || !form || !draftKey || navigationCompletedRef.current || !isCurrentDraftSession()) return;
        const values = form.getFieldsValue(true);
        const hasProgress = values.serviceDomain || values.category || values.name
            || (values._onboardingStep && values._onboardingStep !== 'industry')
            || mainImageRef.current.length || detailImagesRef.current.length;
        if (!hasProgress) return;
        rememberRegistrationNavigation(navigationKey, {
            values: serializeStoreFormValues(values),
            mainImage: serializeDraftImages(mainImageRef.current),
            detailImages: serializeDraftImages(detailImagesRef.current),
            state: draftStateRef.current,
            changed: hasChangesRef.current,
        });
    }, [draftKey, form, isCurrentDraftSession, mode, navigationKey]);

    const cancelAutoSave = useCallback(() => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        if (autoSaveMaxTimerRef.current) clearTimeout(autoSaveMaxTimerRef.current);
        autoSaveTimerRef.current = null;
        autoSaveMaxTimerRef.current = null;
    }, []);

    const revokeRestoredUrls = useCallback(nextFiles => {
        const retained = new Set((nextFiles ?? []).map(file => file?.draftObjectUrl).filter(Boolean));
        restoredObjectUrlsRef.current.forEach(url => {
            if (!retained.has(url)) URL.revokeObjectURL(url);
        });
        restoredObjectUrlsRef.current = retained;
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cancelAutoSave();
            restoredObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
            restoredObjectUrlsRef.current.clear();
        };
    }, [cancelAutoSave]);

    // 수정 모드는 서버 기준값을 먼저 넣는다. 그 다음 effect가 로컬 초안을 비교·복원한다.
    useEffect(() => {
        if (mode !== 'edit' || !initialData || !formReady || !form) return;
        const editKey = String(storeId ?? initialData.id ?? '');
        // React Query는 창 포커스 복귀 때 같은 가게를 새 객체로 다시 줄 수 있다. 그때 서버
        // 기준값을 재주입하면 사용자가 방금 입력한 수정 내용과 로컬 초안이 조용히 사라진다.
        // 한 편집 대상에는 최초 한 번만 기준값을 넣고, 다른 가게로 이동했을 때만 초기화한다.
        if (initializedEditKeyRef.current === editKey) return;
        initializedEditKeyRef.current = editKey;
        const values = initialValuesFromStore(initialData);
        const images = existingImagesFromStore(initialData);
        form.setFieldsValue(values);
        setMainImage(images.mainImage);
        setDetailImages(images.detailImages);
        mainImageRef.current = images.mainImage;
        detailImagesRef.current = images.detailImages;
        baseFingerprintRef.current = fingerprintStoreDraftBase({ values, ...images });
    }, [form, formReady, initialData, mode, storeId]);

    useEffect(() => {
        if (mode !== 'create' || !form || !formReady || baseFingerprintRef.current) return;
        baseFingerprintRef.current = fingerprintStoreDraftBase({
            values: form.getFieldsValue(true),
            mainImage: [],
            detailImages: [],
        });
    }, [form, formReady, mode]);

    const applyDraft = useCallback((draft, navigation = false) => {
        const restoredMain = hydrateDraftImages(draft.mainImage);
        const restoredDetail = hydrateDraftImages(draft.detailImages);
        const restoredValues = hydrateStoreFormValues(draft.values);
        const nextFiles = [...restoredMain.files, ...restoredDetail.files];

        revokeRestoredUrls(nextFiles);
        restoredObjectUrlsRef.current = new Set([
            ...restoredMain.objectUrls,
            ...restoredDetail.objectUrls,
        ]);
        mainImageRef.current = restoredMain.files;
        detailImagesRef.current = restoredDetail.files;
        setMainImage(restoredMain.files);
        setDetailImages(restoredDetail.files);
        form.setFieldsValue({
            ...restoredValues,
            mainImage: restoredMain.files,
            detailImages: restoredDetail.files,
        });
        setDraftState(navigation
            ? { ...draft.state, status: draft.state?.savedAt ? 'saved' : 'idle', error: null }
            : { status: 'saved', savedAt: draft.savedAt, error: null });
        hasChangesRef.current = navigation ? draft.changed : false;
        if (!navigation) message.info('이 브라우저에 임시저장한 내용을 불러왔어요.');
    }, [form, message, revokeRestoredUrls]);

    useEffect(() => {
        const ready = form && formReady && draftKey && isCurrentDraftSession() && (mode === 'create' || initialData);
        if (!ready || restoredKeyRef.current === draftKey) return;
        restoredKeyRef.current = draftKey;
        const navigationDraft = mode === 'create' && readRegistrationNavigation(navigationKey);
        let cancelled = false;
        let settled = false;

        const restore = async () => {
            try {
                if (navigationDraft) {
                    // RAM continuity uses the same cancellable restore boundary without opening IndexedDB.
                    const draft = await Promise.resolve(navigationDraft);
                    if (cancelled || !isCurrentDraftSession()) return;
                    applyDraft(draft, true);
                    settled = true;
                    return;
                }
                await purgeExpiredStoreDrafts();
                const draft = await readStoreDraft(draftKey);
                if (cancelled || !isCurrentDraftSession()) return;
                if (!draft) {
                    settled = true;
                    return;
                }
                const baseChanged = mode === 'edit'
                    && draft.baseFingerprint
                    && baseFingerprintRef.current
                    && draft.baseFingerprint !== baseFingerprintRef.current;
                const savedLabel = new Intl.DateTimeFormat('ko-KR', {
                    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                }).format(draft.savedAt);

                confirmRef.current({
                    title: baseChanged ? '가게 정보가 달라졌어요' : '임시저장된 내용이 있어요',
                    content: baseChanged
                        ? `${savedLabel}에 저장한 초안과 현재 가게 정보가 달라요. 초안을 불러오면 최신 값 일부가 바뀔 수 있어요.`
                        : `${savedLabel}에 이 브라우저에 저장한 내용을 이어서 작성할까요?`,
                    okText: '이어서 작성',
                    cancelText: mode === 'create' ? '새로 작성' : '최신 정보 유지',
                    onOk: () => {
                        if (mountedRef.current && isCurrentDraftSession()) applyDraft(draft);
                    },
                    onCancel: async () => {
                        if (!mountedRef.current || !isCurrentDraftSession()) return;
                        await deleteStoreDraft(draftKey).catch(() => undefined);
                        if (mountedRef.current && isCurrentDraftSession()) {
                            setDraftState({ status: 'idle', savedAt: null, error: null });
                        }
                    },
                });
                settled = true;
            } catch (error) {
                if (!cancelled) {
                    setDraftState({ status: 'error', savedAt: null, error: draftFailureMessage(error) });
                    settled = true;
                }
            }
        };

        void restore();
        return () => {
            cancelled = true;
            // StrictMode의 effect 재실행 중 첫 비동기 조회가 취소됐으면 두 번째 setup이 다시 읽게 한다.
            if (!settled && restoredKeyRef.current === draftKey) restoredKeyRef.current = null;
        };
    }, [applyDraft, draftKey, form, formReady, initialData, isCurrentDraftSession, mode, navigationKey]);

    const persistDraft = useCallback(({ announce = false, automatic = false } = {}) => {
        if (automatic && (!isCurrentDraftSession() || !getStoreDraftAutoSaveEnabled(useAuthStore.getState().user))) {
            return Promise.resolve(undefined);
        }
        if (!draftKey || !form || !isCurrentDraftSession()) {
            const error = new Error('로그인 정보를 확인할 수 없어 임시저장하지 못했어요.');
            if (announce) message.error(error.message);
            return Promise.reject(error);
        }

        cancelAutoSave();

        const sequence = saveSequenceRef.current + 1;
        saveSequenceRef.current = sequence;
        autoSaveActiveRef.current = automatic;
        const snapshot = {
            key: draftKey,
            values: form.getFieldsValue(true),
            mainImage: mainImageRef.current,
            detailImages: detailImagesRef.current,
            baseFingerprint: baseFingerprintRef.current,
        };
        if (mountedRef.current) {
            setDraftState(current => ({ ...current, status: 'saving', error: null }));
        }

        const queued = saveQueueRef.current
            .catch(() => undefined)
            .then(() => {
                if (!isCurrentDraftSession() || (automatic && !getStoreDraftAutoSaveEnabled(useAuthStore.getState().user))) {
                    return undefined;
                }
                return saveStoreDraft(snapshot);
            });
        saveQueueRef.current = queued;

        return queued.then(record => {
            if (!record || !isCurrentDraftSession()) return undefined;
            if (mountedRef.current && saveSequenceRef.current === sequence) {
                setDraftState({ status: 'saved', savedAt: record.savedAt, error: null });
                hasChangesRef.current = false;
            }
            if (announce) message.success('이 브라우저에 임시저장했어요.');
            return record;
        }).catch(error => {
            const errorMessage = draftFailureMessage(error);
            if (mountedRef.current && isCurrentDraftSession() && saveSequenceRef.current === sequence) {
                setDraftState(current => ({ ...current, status: 'error', error: errorMessage }));
            }
            if (announce && isCurrentDraftSession()) message.error(errorMessage);
            throw error;
        });
    }, [cancelAutoSave, draftKey, form, isCurrentDraftSession, message]);

    const scheduleDraftSave = useCallback(() => {
        if (!isCurrentDraftSession()) return;
        hasChangesRef.current = true;
        // 진행 중인 이전 저장이 완료돼도 최신 변경을 saved로 오인하지 않게 무효화한다.
        saveSequenceRef.current += 1;
        if (!getStoreDraftAutoSaveEnabled(useAuthStore.getState().user)) {
            cancelAutoSave();
            setDraftState(current => current.status === 'idle' && current.error == null
                ? current : { ...current, status: 'idle', error: null });
            return;
        }
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        setDraftState(current => current.status === 'pending' && current.error == null
            ? current : { ...current, status: 'pending', error: null });
        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null;
            void persistDraft({ automatic: true }).catch(() => undefined);
        }, AUTO_SAVE_IDLE_MS);
        if (!autoSaveMaxTimerRef.current) {
            autoSaveMaxTimerRef.current = setTimeout(() => {
                autoSaveMaxTimerRef.current = null;
                void persistDraft({ automatic: true }).catch(() => undefined);
            }, AUTO_SAVE_MAX_WAIT_MS);
        }
    }, [cancelAutoSave, isCurrentDraftSession, persistDraft]);

    const handleValuesChange = useCallback(() => scheduleDraftSave(), [scheduleDraftSave]);

    const handleMainImageChange = useCallback(({ fileList }) => {
        const next = fileList.slice(-1);
        revokeRestoredUrls([...next, ...detailImagesRef.current]);
        mainImageRef.current = next;
        setMainImage(next);
        scheduleDraftSave();
    }, [revokeRestoredUrls, scheduleDraftSave]);

    const handleDetailImagesChange = useCallback(({ fileList }) => {
        const next = fileList.slice(0, 5);
        revokeRestoredUrls([...mainImageRef.current, ...next]);
        detailImagesRef.current = next;
        setDetailImages(next);
        scheduleDraftSave();
    }, [revokeRestoredUrls, scheduleDraftSave]);

    const saveDraftNow = useCallback(
        () => persistDraft({ announce: true }).catch(() => undefined),
        [persistDraft],
    );

    useEffect(() => {
        if (!autoSaveEnabled || !isCurrentDraftSession()) {
            cancelAutoSave();
            if (autoSaveActiveRef.current || !isCurrentDraftSession()) saveSequenceRef.current += 1;
            setDraftState(current => current.status === 'pending' || (current.status === 'saving' && autoSaveActiveRef.current)
                ? { ...current, status: 'idle', error: null }
                : current);
        } else if (hasChangesRef.current) {
            scheduleDraftSave();
        }
    }, [autoSaveEnabled, cancelAutoSave, isCurrentDraftSession, scheduleDraftSave, sessionRevision, userId, user?.role]);

    // BrowserRouter는 data-router blocker를 제공하지 않는다. 내부 링크로 즉시 이동해도 마지막
    // 자동저장 대기 중인 마지막 변경이 사라지지 않도록 언마운트 시 IndexedDB 쓰기를 시작한다.
    useEffect(() => () => {
        if (hasChangesRef.current) void persistDraft({ automatic: true }).catch(() => undefined);
    }, [persistDraft]);

    useEffect(() => {
        const warnBeforeUnload = event => {
            if (!hasChangesRef.current || !isCurrentDraftSession()) return;
            event.preventDefault();
            event.returnValue = '';
        };
        const flushBeforeHide = () => {
            if (hasChangesRef.current) void persistDraft({ automatic: true }).catch(() => undefined);
        };
        window.addEventListener('beforeunload', warnBeforeUnload);
        window.addEventListener('pagehide', flushBeforeHide);
        return () => {
            window.removeEventListener('beforeunload', warnBeforeUnload);
            window.removeEventListener('pagehide', flushBeforeHide);
        };
    }, [isCurrentDraftSession, persistDraft]);

    const appendImages = formData => {
        if (mode === 'create') {
            if (mainImageRef.current[0]?.originFileObj) {
                formData.append('mainImage', mainImageRef.current[0].originFileObj);
            }
            detailImagesRef.current.forEach(file => {
                if (file.originFileObj) formData.append('detailImages', file.originFileObj);
            });
            return;
        }

        if (mainImageRef.current[0]?.existingUrl) {
            formData.append('existingMainImageUrl', mainImageRef.current[0].existingUrl);
        } else if (mainImageRef.current[0]?.originFileObj) {
            formData.append('mainImage', mainImageRef.current[0].originFileObj);
        }

        // 화면 순서를 그대로 저장하려고 칸마다 "e{i}"(기존 i번째) / "n{j}"(새 파일 j번째)를 함께 보낸다.
        // 기존·새 목록만 보내면 서버는 기존 → 새 순서로 붙여서, 새 사진을 앞으로 끌어온 정렬이 사라진다.
        const existingUrls = [];
        const order = [];
        let newCount = 0;
        detailImagesRef.current.forEach(file => {
            if (file.existingUrl) {
                order.push(`e${existingUrls.length}`);
                existingUrls.push(file.existingUrl);
            } else if (file.originFileObj) {
                order.push(`n${newCount}`);
                newCount += 1;
                formData.append('detailImages', file.originFileObj);
            }
        });
        existingUrls.forEach(url => formData.append('existingDetailImageUrls', url));
        order.forEach(token => formData.append('detailImageOrder', token));
    };

    const handleSubmit = async values => {
        setLoading(true);
        cancelAutoSave();
        try {
            const formData = buildStoreFormData(values);
            appendImages(formData);

            if (mode === 'create') await storeService.createStore(formData);
            else await storeService.updateStore(storeId, formData);

            if (mode === 'create') {
                navigationCompletedRef.current = true;
                clearRegistrationNavigation();
            }

            // 서버 반영 뒤의 캐시 갱신 실패를 등록·수정 실패로 오인하면 사용자가 같은 요청을
            // 다시 보내 중복 가게를 만들 수 있다. 다음 화면 진입 때 다시 조회할 수 있으므로
            // 제출 성공 경계 밖의 보조 작업으로 취급한다.
            // 2026-09: 가게 이름·대표 사진이 보이는 즐겨찾기·광고 목록도 함께 — invalidateAfterWrite.js 참고.
            await invalidateStoreData(queryClient).catch(() => undefined);
            hasChangesRef.current = false;
            // 제출 직전에 이미 시작된 IndexedDB write가 delete보다 늦게 끝나 초안을 되살리는
            // 경합을 막는다. 타이머는 위에서 취소했으므로 현재 큐까지만 비운 뒤 삭제하면 된다.
            saveSequenceRef.current += 1;
            await saveQueueRef.current.catch(() => undefined);
            await deleteStoreDraft(draftKey).catch(() => undefined);
            message.success(mode === 'create' ? '가게가 등록됐어요' : '가게 정보가 수정됐어요');
            navigate('/my-stores');
        } catch (error) {
            void persistDraft({ automatic: true }).catch(() => undefined);
            handleApiError(error, message, mode === 'create' ? '가게 등록에 실패했어요' : '가게 수정에 실패했어요');
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        mainImage,
        detailImages,
        draftState: { ...draftState, autoSaveEnabled },
        handleSubmit,
        handleValuesChange,
        handleMainImageChange,
        handleDetailImagesChange,
        saveDraftNow,
        getInitialValues: () => initialValuesFromStore(initialData),
    };
};
