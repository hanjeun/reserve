import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Typography } from 'antd';
import { FormModal, FormTextArea } from '../common';
import MfaFlow from '../member/MfaFlow';
import useMessage from '../../hooks/useMessage';
import api from '../../api/axios';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import { API_ENDPOINTS } from '../../constants';
import { handleApiError, isResponseUnconfirmed } from '../../utils/errorHandler';

export default function AccountProtectionModal({ open, member, onClose, afterClose, onChanged }) {
    const { message } = useMessage();
    const [form] = Form.useForm();
    const [verification, setVerification] = useState(null);
    const [verified, setVerified] = useState(false);
    const [busy, setBusy] = useState(false);
    const pending = useRef(false);
    const scope = useRef(currentSession().epoch).current;
    const resend = member.accountProtected === true;
    const eligibleContact = member.protectionContactReady !== false;
    const path = `${API_ENDPOINTS.ADMIN_MANAGE.MEMBERS}/${member.id}/account-protection`;

    const perform = async action => {
        if (pending.current || !isCurrentSession(scope)) return;
        pending.current = true;
        setBusy(true);
        try { await action(); }
        catch (failure) {
            if (!isCurrentSession(scope)) return;
            if (failure.status === 428) {
                setVerification(null);
                setVerified(false);
            }
            if (failure.status === 409 || verified && isResponseUnconfirmed(failure)) {
                void onChanged();
                if (isResponseUnconfirmed(failure)) {
                    message.info('요청 결과를 확인하지 못했어요. 회원 목록에서 보호 상태를 확인해주세요.');
                    onClose();
                    return;
                }
            }
            handleApiError(failure, message);
        } finally {
            pending.current = false;
            if (isCurrentSession(scope)) setBusy(false);
        }
    };
    const begin = () => perform(async () => {
        const fields = resend ? {} : await form.validateFields().catch(() => null);
        if (!fields || !isCurrentSession(scope)) return;
        const view = await api.post(path + '/confirm', { resend }, { skipAuthRefresh: true });
        if (isCurrentSession(scope)) setVerification({ view, reason: fields.reason?.trim() });
    });
    const apply = () => perform(async () => {
        const result = await api.post(path, { resend, reason: verification.reason }, { skipAuthRefresh: true });
        if (!isCurrentSession(scope)) return;
        if (!result?.notificationSubmitted) message.info('계정 보호 중이에요. 메일 발송을 확인하지 못했어요. 잠시 후 다시 보내주세요.');
        else message.success(resend ? '복구 메일을 다시 보냈어요.' : '계정 보호를 시작하고 복구 메일을 보냈어요.');
        void onChanged();
        onClose();
    });
    const verifying = verification && !verified;
    const title = resend ? '복구 메일 재발송' : '계정 탈취 대응';

    return <FormModal title={title} open={open} onClose={onClose} afterClose={afterClose}
        submitting={busy} submitDisabled={!eligibleContact} onSubmit={verified ? apply : begin}
        submitText={verified ? (resend ? '메일 다시 보내기' : '계정 보호 시작') : '관리자 본인 확인'}
        footer={verifying ? null : undefined} scrollResetKey={verified ? 'apply' : verifying ? 'verify' : 'reason'}>
        <Typography.Paragraph style={{ margin: 0 }}><Typography.Text strong>{member.name || '회원'} · #{member.id}</Typography.Text></Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            {resend ? '확인된 보안 이메일로 새 복구 링크를 보내요. 전에 받은 링크는 만료돼요.'
                : '모든 기기의 로그인과 등록을 해제해요. 소유자가 본인 확인으로 복구할 때까지 로그인을 제한하고, 확인된 보안 이메일로 알려요.'}
        </Typography.Paragraph>
        {!eligibleContact ? <Typography.Paragraph type="secondary" style={{ margin: 0 }}>이 회원의 확인된 보안 이메일이 필요해요.</Typography.Paragraph>
            : verifying ? <MfaFlow adminProtection initialView={verification.view} revealOnMount={false}
                onVerified={() => setVerified(true)} onCancel={() => setVerification(null)} />
                : !resend && <Form form={form} layout="vertical" requiredMark={false} onFinish={verified ? apply : begin}>
                    <Form.Item name="reason" label="보호 사유" style={{ marginBottom: 0 }}
                        rules={[{ required: true, whitespace: true, max: 200, message: '보호 사유를 200자 이내로 입력해주세요.' }]}>
                        <FormTextArea rows={3} maxLength={200} readOnly={verified || busy} />
                    </Form.Item>
                </Form>}
    </FormModal>;
}
AccountProtectionModal.propTypes = {
    open: PropTypes.bool.isRequired,
    member: PropTypes.shape({ id: PropTypes.number.isRequired, name: PropTypes.string, accountProtected: PropTypes.bool, protectionContactReady: PropTypes.bool }).isRequired,
    onClose: PropTypes.func.isRequired,
    afterClose: PropTypes.func.isRequired,
    onChanged: PropTypes.func.isRequired,
};
