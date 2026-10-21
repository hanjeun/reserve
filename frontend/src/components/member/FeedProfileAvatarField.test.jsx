import { useState } from 'react';
import { Form } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FeedProfileAvatarField from './FeedProfileAvatarField';

vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { error: vi.fn() } }) }));

function Editor({ busy = false, onSave }) {
    const [form] = Form.useForm();
    const [pendingImage, setPendingImage] = useState('blob:pending-photo');
    return <Form form={form} initialValues={{ avatarSource: 'CUSTOM' }} disabled={busy} onFinish={onSave}>
        <Form.Item name="avatarSource">
            <FeedProfileAvatarField accountImage="/account.png" pendingImage={pendingImage} disabled={busy}
                onSelect={() => {}} onReset={() => setPendingImage(null)} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate>{() => <output aria-label="사진 선택 상태">
            {form.getFieldValue('avatarSource')}:{pendingImage || 'none'}
        </output>}</Form.Item>
        <button type="submit" disabled={busy}>저장</button>
    </Form>;
}

describe('public profile photo reset form connection', () => {
    it('clears a pending photo and submits ACCOUNT through the real form field', async () => {
        const onSave = vi.fn();
        render(<Editor onSave={onSave} />);
        const reset = screen.getByRole('button', { name: '계정 사진으로 되돌리기' });
        expect(reset).toHaveAttribute('type', 'button');
        expect(reset).toHaveStyle({ textDecoration: 'underline' });
        fireEvent.click(reset);
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByLabelText('사진 선택 상태')).toHaveTextContent('ACCOUNT:none');
        expect(screen.queryByRole('button', { name: '계정 사진으로 되돌리기' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '저장', exact: true }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith({ avatarSource: 'ACCOUNT' }));
    });

    it('keeps both photo selection and reset locked while the owner is saving', () => {
        render(<Editor busy onSave={vi.fn()} />);
        const reset = screen.getByRole('button', { name: '계정 사진으로 되돌리기' });
        expect(reset).toBeDisabled();
        expect(screen.getByRole('button', { name: '피드 프로필 사진 변경' })).toBeDisabled();
        fireEvent.click(reset);
        expect(screen.getByLabelText('사진 선택 상태')).toHaveTextContent('CUSTOM:blob:pending-photo');
    });
});
