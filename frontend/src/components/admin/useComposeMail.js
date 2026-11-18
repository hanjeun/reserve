import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import { API_ENDPOINTS } from '../../constants';
import useFormErrors from '../../hooks/useFormErrors';
import { adminKeys } from '../../hooks/queryKeys';
import { sendMailDraft } from '../../services/mailService';
import { deleteMailDraft, readMailDraft, saveMailDraft } from '../../utils/mailDraftStorage';
import { EMAIL_REGEX } from '../../utils/validation';

const EMPTY_FORM = { toEmail: '', subject: '', body: '', marketing: false };

export default function useComposeMail({ message, ownerId, draftKey, onSendError }) {
    const queryClient = useQueryClient();
    const [composing, setComposing] = useState(false);
    const [composeForm, setComposeForm] = useState(EMPTY_FORM);
    const [draft, setDraft] = useState(null);
    const readCounter = useRef(0);
    const { errors, validate, clearError, resetErrors } = useFormErrors();

    const resetCompose = useCallback(() => {
        readCounter.current += 1;
        setComposing(false);
        setComposeForm(EMPTY_FORM);
        setDraft(null);
        resetErrors();
    }, [resetErrors]);
    const startCompose = () => { resetCompose(); setComposing(true); };
    useEffect(() => () => { readCounter.current += 1; }, []);

    const openDraft = useCallback(async id => {
        const read = ++readCounter.current;
        const epoch = currentSession().epoch;
        const current = () => read === readCounter.current && isCurrentSession(epoch);
        try {
            const record = await readMailDraft(ownerId, id);
            if (!current()) return;
            if (!record) {
                message.info('이 브라우저에 남아 있는 메일 초안이 없어요.');
                return;
            }
            resetErrors();
            setDraft(record);
            setComposeForm(record.form);
            setComposing(true);
        } catch {
            if (current()) message.error('메일 초안을 열지 못했어요. 다시 시도해주세요.');
        }
    }, [ownerId, message, resetErrors]);

    const removeDraft = async id => {
        await deleteMailDraft(ownerId, id);
        void queryClient.invalidateQueries({ queryKey: draftKey });
    };
    const saveDraft = async photos => {
        const epoch = currentSession().epoch;
        await saveMailDraft(ownerId, { id: draft?.id, form: composeForm, photos });
        if (!isCurrentSession(epoch)) throw new DOMException('로그인 세션이 바뀌었어요.', 'AbortError');
        void queryClient.invalidateQueries({ queryKey: draftKey });
        message.success('메일을 임시저장했어요.');
    };

    const sendMutation = useMutation({
        mutationFn: ({ form, photos }) => sendMailDraft(API_ENDPOINTS.MAIL.COMPOSE, form, photos),
        onSuccess: async (_, { draftId, epoch }) => {
            let removed = true;
            if (draftId) {
                try { await removeDraft(draftId); }
                catch { removed = false; }
            }
            if (!isCurrentSession(epoch)) return;
            if (removed) message.success('메일을 보냈어요.');
            else message.warning('메일을 보냈어요. 임시저장본은 목록에서 직접 삭제해주세요.');
            resetCompose();
            void queryClient.invalidateQueries({ queryKey: adminKeys.sentMails() });
        },
        onError: onSendError,
    });

    const validateCompose = () => {
        const trimmedEmail = composeForm.toEmail.trim();
        return validate(fields => {
            if (!trimmedEmail) fields.toEmail = '받는 사람 이메일을 입력해주세요.';
            else if (!EMAIL_REGEX.test(trimmedEmail)) fields.toEmail = '올바른 이메일 형식을 입력해주세요.';
            if (!composeForm.subject.trim()) fields.subject = '제목을 입력해주세요.';
            if (!composeForm.body.trim()) fields.body = '내용을 입력해주세요.';
        });
    };
    const handleComposeSend = photos => {
        if (sendMutation.isPending) return;
        sendMutation.mutate({ form: { ...composeForm, toEmail: composeForm.toEmail.trim() }, photos,
            draftId: draft?.id, epoch: currentSession().epoch });
    };
    const changed = Object.keys(EMPTY_FORM).some(field => composeForm[field] !== (draft?.form || EMPTY_FORM)[field]);

    return { composing, startCompose, composeForm, setComposeForm, composeSending: sendMutation.isPending,
        resetCompose, validateCompose, handleComposeSend, errors, clearError, changed, initialPhotos: draft?.photos,
        openDraft, saveDraft, removeDraft };
}
