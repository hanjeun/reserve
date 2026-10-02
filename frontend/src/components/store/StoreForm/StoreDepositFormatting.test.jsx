import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App as AntApp, Form } from 'antd';
import StoreBasicInfo from './StoreBasicInfo';

vi.mock('../../../hooks', () => ({ useWindowWidth: () => 390 }));
vi.mock('./AddressSearch', () => ({ default: () => <div /> }));
vi.mock('../../common', async () => {
    const { default: FormInput } = await import('../../common/FormInput');
    // Keep the real numeric input and form wiring; unrelated pickers have separate tests.
    const UnrelatedField = () => <div />;
    UnrelatedField.RangePicker = UnrelatedField;
    return {
        FormInput,
        FormSelect: UnrelatedField,
        FormDatePicker: UnrelatedField,
        FormTimePicker: UnrelatedField,
        FormTextArea: UnrelatedField,
    };
});

function DepositInspector({ form }) {
    const [stored, setStored] = React.useState('');
    return (
        <>
            <button type="button" onClick={() => setStored(String(form.getFieldValue('noShowDeposit')))}>
                값 확인
            </button>
            <span data-testid="stored-deposit">{stored}</span>
        </>
    );
}

function Harness() {
    const [form] = Form.useForm();
    return (
        <AntApp>
            <Form form={form} initialValues={{ noShowDeposit: 100000 }}>
                <StoreBasicInfo form={form} />
            </Form>
            <DepositInspector form={form} />
        </AntApp>
    );
}

describe('deposit display and numeric form value', () => {
    it('formats the initial value and keeps edited values numeric', () => {
        render(<Harness />);
        const input = screen.getByLabelText('노쇼 예약금');
        const inspect = screen.getByRole('button', { name: '값 확인' });
        expect(input).toHaveValue('100,000');

        fireEvent.change(input, { target: { value: '12,000' } });
        fireEvent.blur(input);
        expect(input).toHaveValue('12,000');
        fireEvent.click(inspect);
        expect(screen.getByTestId('stored-deposit')).toHaveTextContent(/^12000$/);

        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);
        expect(input).toHaveValue('');
        fireEvent.click(inspect);
        expect(screen.getByTestId('stored-deposit')).toHaveTextContent(/^null$/);
    });
});
