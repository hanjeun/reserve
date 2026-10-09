import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Form, Input } from 'antd';
import { PageContainer, PageTitle } from '../common';
import Bone from '../common/Bone';
import StoreFormActions from './StoreForm/StoreFormActions';
import StoreEditSelection from './StoreEditSelection';
import { IndustryQuestion, ServiceQuestion, BookingQuestion, WaitingQuestion, OperationQuestion, IdentityQuestion, RegistrationSummary } from './StoreOnboardingFields';
import { STORE_FORM_DENSITY_VARS, storeFormFrame } from './storeFormFrame';
import { useWindowWidth } from '../../hooks';
import useReducedMotion from '../../hooks/useReducedMotion';
import { useSkeletonShown } from '../layout/loadingPresentation';
import { STORE_ONBOARDING_DEFAULTS, onboardingSteps, onboardingPreviewStore } from '../../utils/storeOnboarding';
import { REGISTRATION_BACK_EVENT } from '../../utils/storeRegistrationNavigation';

const StoreDetailPreview = lazy(() => import('./StoreDetailPreview'));
const EMPTY_IMAGES = [];
const navigationValues = values => ({
    _onboardingStep: values._onboardingStep,
    _onboardingHistory: values._onboardingHistory,
    _onboardingPreviewDevice: values._onboardingPreviewDevice,
    reservationEnabled: values.reservationEnabled,
    waitingIntakeMode: values.waitingIntakeMode,
});

function usePreviewImages(mainImage, detailImages) {
    const [urls, setUrls] = useState([]);
    useEffect(() => {
        const created = [];
        const next = [...mainImage, ...detailImages].map(file => {
            if (file.originFileObj instanceof Blob) {
                const url = URL.createObjectURL(file.originFileObj);
                created.push(url);
                return url;
            }
            return file.url || file.existingUrl || file.preview;
        }).filter(Boolean);
        const frame = requestAnimationFrame(() => setUrls(next));
        return () => { cancelAnimationFrame(frame); created.forEach(url => URL.revokeObjectURL(url)); };
    }, [mainImage, detailImages]);
    return urls;
}

/** Registration and item-based editing share questions, explicit submission and account-scoped drafts. */
export default function StoreOnboarding({ mode = 'create', form, formRef, initialValues, originalStore,
    onSubmit, loading = false, mainImage = EMPTY_IMAGES,
    detailImages = EMPTY_IMAGES, onValuesChange, onSaveDraft, draftState, ...images }) {
    const firstStep = mode === 'edit' ? 'selection' : 'industry';
    // Text and photo values stay in their own fields rather than serializing the entire form on each key.
    const watched = Form.useWatch(navigationValues, { form, preserve: true });
    const values = { ...STORE_ONBOARDING_DEFAULTS, _onboardingStep: firstStep, ...watched };
    const steps = onboardingSteps(values, mode);
    const index = Math.max(0, steps.findIndex(step => step.key === values._onboardingStep));
    const current = steps[index];
    const last = index === steps.length - 1;
    const heading = useRef(null);
    const advancing = useRef(false);
    const [stepChanged, setStepChanged] = useState(false);
    const reducedMotion = useReducedMotion();
    const skeletonShown = useSkeletonShown();
    const { container, isMobile } = storeFormFrame(useWindowWidth());
    const imageUrls = usePreviewImages(mainImage, detailImages);
    const reviewValues = last ? { ...STORE_ONBOARDING_DEFAULTS, ...form.getFieldsValue(true) } : null;
    const history = Array.isArray(values._onboardingHistory) ? values._onboardingHistory : [];
    const returningToReview = !last && history.at(-1) === 'review';
    const change = useCallback(next => {
        form.setFieldsValue(next);
        onValuesChange?.(next, form.getFieldsValue(true));
    }, [form, onValuesChange]);
    const goTo = useCallback((step, backHistory) => {
        const entered = { ...STORE_ONBOARDING_DEFAULTS, ...form.getFieldsValue(true) };
        if (!onboardingSteps(entered, mode).some(item => item.key === step) || entered._onboardingStep === step) return;
        const visited = Array.isArray(entered._onboardingHistory) ? entered._onboardingHistory : [];
        const previous = entered._onboardingStep || firstStep;
        setStepChanged(true);
        change({ _onboardingStep: step,
            _onboardingHistory: backHistory ?? [...visited, previous].slice(-64) });
        requestAnimationFrame(() => {
            heading.current?.focus({ preventScroll: true });
            heading.current?.scrollIntoView?.({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
        });
    }, [change, firstStep, form, mode, reducedMotion]);
    const editStep = useCallback(step => {
        if (loading || advancing.current) return;
        goTo(step, mode === 'edit' ? [form.getFieldValue('_onboardingStep') === 'review' ? 'review' : 'selection'] : undefined);
        if (step === 'operation') requestAnimationFrame(() => {
            document.querySelector('[data-onboarding-step="operation"] .reserve-onboarding-advanced')?.setAttribute('open', '');
        });
    }, [form, goTo, loading, mode]);
    useEffect(() => {
        const previousStep = event => {
            const entered = { ...STORE_ONBOARDING_DEFAULTS, ...form.getFieldsValue(true) };
            if (mode === 'edit') {
                const step = entered._onboardingStep || 'selection';
                if (step === 'selection') return;
                event.preventDefault();
                const visited = Array.isArray(entered._onboardingHistory) ? entered._onboardingHistory : [];
                const previous = step !== 'review' && visited.at(-1) === 'review' ? 'review' : 'selection';
                if (!loading && !advancing.current) goTo(previous, previous === 'review' ? ['selection'] : []);
                return;
            }
            const activeSteps = onboardingSteps(entered, mode);
            const activeIndex = Math.max(0, activeSteps.findIndex(step => step.key === entered._onboardingStep));
            const visited = Array.isArray(entered._onboardingHistory) ? [...entered._onboardingHistory] : [];
            let previous;
            while (visited.length && !previous) {
                const candidate = visited.pop();
                if (candidate !== entered._onboardingStep && activeSteps.some(step => step.key === candidate)) previous = candidate;
            }
            previous ??= activeSteps[activeIndex - 1]?.key;
            if (!previous) return;
            event.preventDefault();
            if (!loading && !advancing.current) goTo(previous, visited);
        };
        window.addEventListener(REGISTRATION_BACK_EVENT, previousStep);
        return () => window.removeEventListener(REGISTRATION_BACK_EVENT, previousStep);
    }, [form, goTo, loading, mode]);
    const revealError = errorFields => requestAnimationFrame(() => {
        const name = errorFields?.[0]?.name?.[0];
        const details = document.getElementById(name)?.closest('details');
        details?.setAttribute('open', '');
    });
    const next = async () => {
        if (advancing.current || loading || last) return;
        advancing.current = true;
        try {
            const entered = { ...STORE_ONBOARDING_DEFAULTS, ...form.getFieldsValue(true) };
            const activeSteps = onboardingSteps(entered, mode);
            const activeIndex = Math.max(0, activeSteps.findIndex(step => step.key === entered._onboardingStep));
            await form.validateFields(activeSteps[activeIndex].fields);
            if (mode === 'edit') {
                goTo('review', ['selection']);
                return;
            }
            if (Array.isArray(entered._onboardingHistory) && entered._onboardingHistory.at(-1) === 'review') {
                goTo('review', entered._onboardingHistory.slice(0, -1));
                return;
            }
            const following = activeSteps[activeIndex + 1];
            if (following) goTo(following.key);
        }
        catch (failure) { revealError(failure.errorFields); }
        finally { advancing.current = false; }
    };
    const validationFailed = ({ errorFields }) => {
        const name = errorFields[0]?.name?.[0];
        const step = steps.find(item => item.fields.includes(name));
        if (step) goTo(step.key, mode === 'edit' ? ['review'] : undefined);
        revealError(errorFields);
    };
    const register = async () => {
        if (advancing.current || loading || !last || form.getFieldValue('_onboardingStep') !== 'review') return;
        advancing.current = true;
        try {
            const submitted = await form.validateFields();
            if (form.getFieldValue('_onboardingStep') !== 'review') return;
            const allValues = { ...STORE_ONBOARDING_DEFAULTS, ...form.getFieldsValue(true), ...submitted };
            // Booking fields remain in the draft when switching modes, but a waiting-only store takes no deposit.
            if (mode === 'create' && allValues.reservationEnabled === false) allValues.noShowDeposit = 0;
            await onSubmit(allValues);
        } catch (failure) {
            if (failure.errorFields) validationFailed(failure);
        } finally { advancing.current = false; }
    };
    return <PageContainer {...container} size={last && !isMobile ? 'xl' : container.size}
        className="reserve-store-form-page reserve-onboarding-page" style={STORE_FORM_DENSITY_VARS}
        data-onboarding-step={current.key}
        data-step-motion={skeletonShown && !stepChanged ? 'false' : undefined}>
        <div className="reserve-onboarding-shell">
            <PageTitle key={current.key} level={1} ref={heading} tabIndex={-1} className="reserve-onboarding-heading">{current.title}</PageTitle>
            <Form form={form} ref={formRef} layout="vertical" requiredMark={false} validateTrigger="onBlur" size="large"
                className="reserve-store-form" initialValues={{ ...STORE_ONBOARDING_DEFAULTS, _onboardingStep: firstStep,
                    _onboardingHistory: [], _onboardingPreviewDevice: 'mobile', ...initialValues }}
                onValuesChange={onValuesChange}
                onSubmitCapture={event => event.preventDefault()}
                onKeyDown={event => {
                    if (event.key === 'Enter' && ['INPUT', 'SELECT'].includes(event.target.tagName)) event.preventDefault();
                }}>
                <Form.Item name="_onboardingStep" hidden><Input /></Form.Item>
                {mode === 'edit' && <fieldset disabled={loading} className="reserve-onboarding-step" hidden={current.key !== 'selection'}>
                    <StoreEditSelection onSelectStep={editStep} disabled={loading} />
                </fieldset>}
                <fieldset disabled={loading} className="reserve-onboarding-step" hidden={current.key !== 'industry'}>
                    <IndustryQuestion change={change} />
                </fieldset>
                <fieldset disabled={loading} className="reserve-onboarding-step" hidden={current.key !== 'service'}>
                    <ServiceQuestion values={values} change={change} disabled={loading} mode={mode} />
                </fieldset>
                <fieldset disabled={loading} className="reserve-onboarding-step" hidden={current.key !== 'booking'}>
                    <BookingQuestion mode={mode} />
                </fieldset>
                <fieldset disabled={loading} className="reserve-onboarding-step" hidden={current.key !== 'waiting'}>
                    <WaitingQuestion mode={mode} />
                </fieldset>
                <fieldset disabled={loading} className="reserve-onboarding-step" hidden={current.key !== 'operation'}>
                    <OperationQuestion mode={mode} />
                </fieldset>
                <fieldset disabled={loading} className="reserve-onboarding-step" hidden={current.key !== 'identity'}>
                    <IdentityQuestion change={change} mode={mode} mainImage={mainImage} detailImages={detailImages} {...images} />
                </fieldset>
                {last && <div className="reserve-onboarding-review">
                    <Suspense fallback={<Bone width="100%" height={380} />}>
                        <StoreDetailPreview store={onboardingPreviewStore(reviewValues, imageUrls, originalStore)}
                            infoContent={<RegistrationSummary values={reviewValues} goTo={editStep} disabled={loading} mode={mode}
                                imageCounts={{ main: mainImage.length, detail: detailImages.length }} />}
                            device={values._onboardingPreviewDevice || 'mobile'}
                            onDeviceChange={device => change({ _onboardingPreviewDevice: device })} />
                    </Suspense>
                </div>}
                <StoreFormActions mode={mode} loading={loading} onSaveDraft={onSaveDraft} draftState={draftState}
                    onNext={last ? undefined : next} nextLabel={mode === 'edit' || returningToReview ? '미리보기' : '다음'} onConfirm={register} />
            </Form>
        </div>
    </PageContainer>;
}
