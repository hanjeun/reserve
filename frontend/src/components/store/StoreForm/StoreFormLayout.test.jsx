import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp, Form } from 'antd';
import postcss from 'postcss';
import layoutCss from '../../../styles/global/store-form-layout.css?raw';
import StoreForm from './index';

const state = vi.hoisted(() => ({ width: 390 }));
vi.mock('../../../hooks', () => ({ useWindowWidth: () => state.width }));
vi.mock('./AddressSearch', () => ({
    default: ({ id, value = '', zipCode = '', addressDetail = '', onChange }) => (
        <div>
            <input id={id} value={value} onChange={event => onChange?.(event.target.value)} />
            <span data-testid="address-postcode">{zipCode}</span>
            <span data-testid="address-detail">{addressDetail}</span>
        </div>
    ),
}));

function Harness(props) {
    const [form] = Form.useForm();
    return <AntApp><StoreForm form={form} {...props} /></AntApp>;
}

function DraftRestoreHarness() {
    const [form] = Form.useForm();
    return (
        <AntApp>
            <button type="button" onClick={() => form.setFieldsValue({
                address: '경기 안산시 단원구 광덕동로 26', zipCode: '15455', addressDetail: '2층',
            })}>초안 복원 테스트</button>
            <StoreForm form={form} />
        </AntApp>
    );
}

const rowFor = label => screen.getByLabelText(label).closest('.reserve-store-form-row');

describe('StoreForm responsive layout contract', () => {
    beforeEach(() => {
        state.width = 390;
    });

    it('uses the registered compact mobile size in the shared create form only', () => {
        const { container } = render(<Harness />);
        const page = container.querySelector('.reserve-store-form-page');
        expect(page.style.padding).toBe('20px 16px 40px');
        expect(page.style.getPropertyValue('--reserve-store-form-control-height')).toBe('44px');
        expect(page.style.getPropertyValue('--reserve-store-form-control-radius')).toBe('10px');
        expect(page.style.getPropertyValue('--reserve-store-form-field-gap')).toBe('12px');
        expect(container.querySelector('form')).toHaveClass('reserve-store-form');
        expect(screen.getByRole('heading', { name: '가게 등록' })).toBeInTheDocument();
    });

    it('pairs short structured fields without changing their actual field values', () => {
        render(<Harness mode="edit" initialValues={{ fullRefundDays: 3, partialRefundDays: 1, partialRefundRate: 50, bookingDeadlineHours: 1, paymentTimeoutMinutes: 10 }} />);
        expect(rowFor('예약 방식')).toHaveClass('reserve-store-form-row--compact');
        expect(rowFor('서비스 분야')).toBe(rowFor('예약 방식'));
        expect(rowFor('예약 단위')).toHaveClass('reserve-store-form-row--compact');
        expect(rowFor('연락처')).toBe(rowFor('예약 단위'));
        expect(rowFor('최대 예약 인원')).toHaveClass('reserve-store-form-row--compact');
        expect(rowFor('노쇼 예약금')).toBe(rowFor('최대 예약 인원'));
        expect(rowFor('전액 환불')).toHaveClass('reserve-store-form-row--compact');
        expect(rowFor('부분 환불')).toBe(rowFor('전액 환불'));
        expect(rowFor('부분 환불율')).toBe(rowFor('전액 환불'));
        expect(rowFor('예약 마감')).toHaveClass('reserve-store-form-row--compact');
        expect(rowFor('결제 마감')).toBe(rowFor('예약 마감'));
        expect(screen.getByLabelText('전액 환불').closest('.ant-select')).toHaveTextContent('3일 전');
        expect(screen.getByLabelText('부분 환불율').closest('.ant-select')).toHaveTextContent('50%');
        expect(screen.getByRole('heading', { name: '가게 정보 수정' })).toBeInTheDocument();
    });

    it('keeps time ranges and longer help text out of compact columns', () => {
        render(<Harness />);
        expect(rowFor('영업 시간')).not.toHaveClass('reserve-store-form-row--compact');
        expect(rowFor('영업 시간')).toHaveClass('reserve-store-form-row--time');
        expect(rowFor('브레이크 타임')).toBe(rowFor('영업 시간'));
        expect(screen.getByLabelText('카테고리').closest('.reserve-store-form-row')).toBeNull();
        expect(screen.getByLabelText('가게 이름').closest('.reserve-store-form-row')).toBeNull();
    });

    it('preserves desktop container padding and two main sections', () => {
        state.width = 1200;
        const { container } = render(<Harness />);
        expect(container.querySelector('.reserve-store-form-page').style.padding).toBe('48px 24px 80px');
        const columns = container.querySelector('form > div');
        expect(columns.style.gridTemplateColumns).toBe('1fr 1px 1fr');
        expect(screen.getByLabelText('가게 이름').style.height).toBe('54px');
    });

    it('does not squeeze two time ranges into two main columns at narrow tablet widths', () => {
        state.width = 820;
        const { container } = render(<Harness />);
        expect(container.querySelector('.reserve-store-form-page').style.maxWidth).toBe('700px');
        expect(container.querySelector('form > div').style.gridTemplateColumns).toBe('');
        expect(rowFor('영업 시간')).not.toHaveClass('reserve-store-form-row--compact');
        expect(screen.getByLabelText('가게 이름').style.height).toBe('54px');
    });

    it('keeps draft saving separate from the native submit button', () => {
        const onSaveDraft = vi.fn();
        const onSubmit = vi.fn();
        render(<Harness onSaveDraft={onSaveDraft} onSubmit={onSubmit} />);
        const save = screen.getByRole('button', { name: '임시저장' });
        expect(save).toHaveAttribute('type', 'button');
        expect(screen.getByRole('button', { name: '등록 완료' })).toHaveAttribute('type', 'submit');
        fireEvent.click(save);
        expect(onSaveDraft).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('feeds restored postcode and detail values back into the address control', async () => {
        render(<DraftRestoreHarness />);
        fireEvent.click(screen.getByRole('button', { name: '초안 복원 테스트' }));
        await waitFor(() => expect(screen.getByTestId('address-postcode')).toHaveTextContent('15455'));
        expect(screen.getByTestId('address-detail')).toHaveTextContent('2층');
    });

    it('retains the existing pending submit and draft disable states', () => {
        render(<Harness mode="edit" loading />);
        expect(screen.getByRole('button', { name: '임시저장' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '수정 중...' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '수정 중...' })).toHaveAttribute('aria-busy', 'true');
    });

    it('keeps exact mobile Select height in scoped AntD 6 variables', () => {
        const root = postcss.parse(layoutCss);
        let selectRule;
        root.walkRules(rule => {
            if (rule.selector === '.reserve-store-form .ant-select.reserve-form-select') selectRule = rule;
        });
        const declarations = Object.fromEntries(selectRule.nodes.map(node => [node.prop, node.value]));
        expect(declarations['--ant-select-height']).toBe('var(--reserve-store-form-control-height, 44px)');
        expect(declarations['--ant-select-font-height']).toBe('24px');
        expect(declarations['--ant-select-border-size']).toBe('0px');
        expect(selectRule.parent.params).toBe('(max-width: 767px)');
    });

    it('limits time-range stacking to the measured narrow desktop interval', () => {
        const root = postcss.parse(layoutCss);
        let timeRule;
        root.walkRules(rule => {
            if (rule.selector === '.reserve-store-form .reserve-store-form-row--time') timeRule = rule;
        });
        expect(timeRule.parent.params).toBe('(min-width: 900px) and (max-width: 1023px)');
        expect(timeRule.nodes.find(node => node.prop === 'flex-direction').value).toBe('column');
    });

    it('does not retain a large 40px label box in the compact vertical mobile form', () => {
        const root = postcss.parse(layoutCss);
        let labelRule;
        root.walkRules(rule => {
            if (rule.selector === '.reserve-store-form.ant-form .ant-form-item .ant-form-item-label > label') labelRule = rule;
        });
        const declarations = Object.fromEntries(labelRule.nodes.map(node => [node.prop, node.value]));
        expect(declarations).toEqual(expect.objectContaining({ height: 'auto', 'min-height': '22px', 'white-space': 'normal' }));
        expect(labelRule.parent.params).toBe('(max-width: 767px)');
    });
});
