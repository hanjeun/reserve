import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StoreOnboardingSkeleton from './StoreOnboardingSkeleton';
import questionSource from './StoreOnboardingFields.jsx?raw';
import selectionSource from './StoreEditSelection.jsx?raw';
import { STORE_EDIT_SELECTION_HELP } from '../../utils/storeOnboarding';

const originalWidth = window.innerWidth;
const setWidth = width => Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

describe('StoreOnboardingSkeleton used by registration and editing', () => {
    afterEach(() => setWidth(originalWidth));

    it('mirrors the first industry question in order without exposing later questions or inputs', () => {
        const { container } = render(<StoreOnboardingSkeleton />);
        expect(container.querySelector('h1')).toHaveTextContent('어떤 가게를 운영하시나요?');
        const labels = Array.from(container.querySelectorAll('.reserve-store-form-skeleton-label'), field => field.textContent);
        expect(labels).toEqual(['서비스 분야', '업종']);
        const form = container.querySelector('.reserve-store-form-skeleton');
        expect(Array.from(form.children, child => child.className)).toEqual([
            'reserve-store-form-skeleton-label',
            'reserve-service-domain-picker',
            'reserve-store-form-skeleton-label',
            'reserve-skeleton-block',
            'reserve-onboarding-help',
            '',
        ]);
        expect(container.querySelectorAll('.reserve-service-domain-option')).toHaveLength(6);
        expect(container.querySelector('[data-skeleton-section="settings"], [data-skeleton-section="images"]')).toBeNull();
        expect(container.querySelector('input,button,select,textarea,a,img')).toBeNull();
    });

    it('reserves the six editing choices instead of presenting an already-open full form', () => {
        const { container } = render(<StoreOnboardingSkeleton mode="edit" />);
        expect(container.querySelector('h1')).toHaveTextContent('무엇을 수정하시겠어요?');
        expect(container.querySelector('.reserve-onboarding-edit-selection')).toBeInTheDocument();
        expect(container.querySelectorAll('.reserve-service-domain-option')).toHaveLength(6);
        expect(container.querySelector('.reserve-store-form-skeleton-label')).toBeNull();
        expect(container.querySelector('input,button,select,textarea,a,img')).toBeNull();
    });

    it.each(['create', 'edit'])('matches the choice media and label slots for %s', mode => {
        const { container } = render(<StoreOnboardingSkeleton mode={mode} />);
        const picker = container.querySelector('.reserve-service-domain-picker');
        expect(picker).toHaveAttribute('aria-hidden', 'true');
        const choices = picker.querySelectorAll('.reserve-service-domain-option');
        expect(choices).toHaveLength(6);
        choices.forEach(choice => {
            expect(choice.querySelector('.reserve-service-domain-option__media > .reserve-skeleton-block'))
                .toHaveStyle({ width: '56px', height: '56px', borderRadius: '50%' });
            expect(choice.querySelector('.reserve-service-domain-option__label > .reserve-skeleton-block'))
                .toHaveStyle({ height: '20px' });
        });
    });

    it.each([
        [1280, '1000px', '48px 24px 80px', '54px', '56px', '16px'],
        [820, '700px', '48px 24px 80px', '54px', '56px', '16px'],
        [390, '420px', '20px 16px 40px', 'var(--reserve-store-form-control-height, 44px)', 'var(--reserve-store-form-control-height, 44px)', 'var(--reserve-store-form-control-radius, 10px)'],
    ])('keeps the real question frame, control and paired action geometry at %ipx', (width, maxWidth, padding, inputHeight, buttonHeight, buttonRadius) => {
        setWidth(width);
        const { container, unmount } = render(<StoreOnboardingSkeleton />);
        const frame = container.querySelector('.reserve-page-container');
        expect(frame).toHaveStyle({ maxWidth, padding, width: '100%', boxSizing: 'border-box' });
        expect(frame).toHaveStyle({ minHeight: 'calc(100svh - 64px)' });
        expect(frame.style.getPropertyValue('--reserve-store-form-control-height')).toBe('44px');
        expect(frame.style.getPropertyValue('--reserve-store-form-control-radius')).toBe('10px');
        const form = container.querySelector('.reserve-store-form-skeleton');
        expect(form.children[3].style.height).toBe(inputHeight);
        const verifyActions = skeleton => {
            const actions = skeleton.querySelector('.reserve-store-form-skeleton').lastElementChild;
            expect(actions).toHaveAttribute('aria-hidden', 'true');
            expect(actions).toHaveStyle({ display: 'flex', gap: '12px' });
            expect(actions.children).toHaveLength(2);
            Array.from(actions.children).forEach(button => {
                expect(button).toHaveClass('reserve-skeleton-block');
                expect(button.style.height).toBe(buttonHeight);
                expect(button.style.borderRadius).toBe(buttonRadius);
                expect(button).toHaveStyle({ flexGrow: '1', flexShrink: '1', flexBasis: '0px', minWidth: '0px' });
            });
            expect(skeleton.querySelector('input,button,select,textarea,a')).toBeNull();
        };
        verifyActions(container);
        unmount();
        const edit = render(<StoreOnboardingSkeleton mode="edit" />);
        expect(edit.container.querySelector('.reserve-page-container')).toHaveStyle({ maxWidth, padding });
        expect(edit.container.querySelector('h1')).toHaveTextContent('무엇을 수정하시겠어요?');
        verifyActions(edit.container);
    });

    it('keeps the fixed question and editing help identical to their real consumers', () => {
        const industryHelp = '조금 더 구체적으로 알려주세요. 예: 필라테스, 네일샵, 한식';
        const { container, rerender } = render(<StoreOnboardingSkeleton />);
        expect(container.querySelector('.reserve-onboarding-help')).toHaveTextContent(industryHelp);
        expect(questionSource).toContain(industryHelp);
        rerender(<StoreOnboardingSkeleton mode="edit" />);
        expect(container.querySelector('.reserve-onboarding-help')).toHaveTextContent(STORE_EDIT_SELECTION_HELP);
        expect(selectionSource).toContain('{STORE_EDIT_SELECTION_HELP}');
    });
});
