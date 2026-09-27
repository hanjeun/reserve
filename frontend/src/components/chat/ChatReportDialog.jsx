import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { FormField, FormModal, FormSelect, FormTextArea } from '../common';
import { useMessage } from '../../hooks';
import { chatService } from '../../services';
import useAuthStore from '../../store/useAuthStore';

const REASONS = [
    { value: 'SPAM', label: '스팸·도배' }, { value: 'HARASSMENT', label: '욕설·괴롭힘' },
    { value: 'INAPPROPRIATE', label: '부적절한 내용' }, { value: 'FRAUD', label: '사기·결제 유도' },
    { value: 'OTHER', label: '기타' },
];

/** 대화와 특정 메시지 신고 모두 같은 입력·세션·제출 관문을 사용한다. 열 때마다 마운트한다. */
export default function ChatReportDialog({ roomId, viewerRole, messageId, onClose }) {
    const { message } = useMessage();
    const [reason, setReason] = useState(null);
    const [details, setDetails] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [visible, setVisible] = useState(true);
    const active = useRef(false);
    const revision = useAuthStore(state => state.sessionRevision);
    const [openedRevision] = useState(revision);
    const submit = async () => {
        if (active.current || openedRevision !== useAuthStore.getState().sessionRevision) return;
        if (!reason || (reason === 'OTHER' && !details.trim())) {
            setError(reason ? '기타 사유를 설명해주세요.' : '신고 사유를 선택해주세요.');
            return;
        }
        active.current = true;
        setError('');
        setSubmitting(true);
        try {
            await chatService.reportConversation(roomId, viewerRole, { reason,
                details: details.trim() || undefined, ...(messageId ? { messageId } : {}) });
            if (openedRevision !== useAuthStore.getState().sessionRevision) return;
            setVisible(false);
            message.success('신고를 접수했습니다. 관리자가 확인할게요.');
        } catch (failure) {
            if (openedRevision === useAuthStore.getState().sessionRevision) message.error(
                (failure?.status ?? failure?.response?.status) === 429
                    ? '신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' : '신고를 접수하지 못했습니다.');
        } finally { active.current = false; setSubmitting(false); }
    };
    return <FormModal title={messageId ? '메시지 신고' : '대화 신고'} open={visible && openedRevision === revision}
        onClose={() => { if (!active.current) setVisible(false); }} afterClose={onClose} onSubmit={submit}
        submitting={submitting} submitText="신고 접수" submitDisabled={!reason}>
        <FormField label="신고 사유" error={error}>
            <FormSelect value={reason} onChange={value => { setReason(value); setError(''); }}
                options={REASONS} placeholder="사유를 선택해주세요" />
        </FormField>
        <FormField label="상세 설명 (선택)">
            <FormTextArea value={details} onChange={event => setDetails(event.target.value)} rows={4}
                maxLength={500} showCount placeholder="관리자가 확인할 내용을 적어주세요" />
        </FormField>
    </FormModal>;
}
ChatReportDialog.propTypes = { roomId: PropTypes.number.isRequired, viewerRole: PropTypes.string.isRequired,
    messageId: PropTypes.number, onClose: PropTypes.func.isRequired };
