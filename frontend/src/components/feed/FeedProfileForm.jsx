import { useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { Button } from '../common';
import { ModalActionGroup } from '../common/ModalActions';
import { useEditorDialog } from '../common/editorDialogContext';
import useSaveFeedProfile from '../../hooks/useSaveFeedProfile';
import FeedProfileFields from './FeedProfileFields';
import { assertCurrentSession, currentSession } from '../../api/sessionScope';

export default function FeedProfileForm({ open, profile, onClose, onSaved }) {
    const [form] = Form.useForm();
    const initialized = useRef(false);
    const submitLock = useRef(false);
    useLayoutEffect(() => {
        if (!open) { initialized.current = false; return; }
        if (initialized.current) return;
        initialized.current = true;
        form.setFieldsValue({ nickname: profile?.nickname || '', bio: profile?.bio || '', useAccountAvatar: profile ? profile.useAccountAvatar === true : true });
    }, [open, profile, form]);
    const save = useSaveFeedProfile(onSaved);
    const close = () => { if (!save.isPending && !submitLock.current) onClose(); };
    const submit = async () => {
        if (save.isPending || submitLock.current) return;
        submitLock.current = true;
        const session = currentSession().epoch;
        try { const values = await form.validateFields(); assertCurrentSession(session); await save.mutateAsync({ ...values, session }); }
        catch { /* 입력 오류는 해당 필드에서 안내하고 계정이 바뀌면 저장하지 않는다. */ }
        finally { submitLock.current = false; }
    };
    useEditorDialog({ title: profile ? '공개 프로필 수정' : '처음 글쓰기 · 공개 닉네임', onClose: close, scrollResetKey: 'profile', width: 520,
        footer: <ModalActionGroup><Button variant="outline" size="sm" onClick={close} disabled={save.isPending}>닫기</Button>
            <Button size="sm" onClick={submit} loading={save.isPending}>
                {profile ? '저장' : '저장하고 작성하기'}</Button></ModalActionGroup> });
    return <>
        <p className="reserve-feed-note">피드에서 사용할 공개 닉네임을 정해주세요.</p>
        <Form form={form} layout="vertical" disabled={save.isPending}>
            <FeedProfileFields />
        </Form>
    </>;
}
FeedProfileForm.propTypes = { open: PropTypes.bool.isRequired, profile: PropTypes.object,
    onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired };
