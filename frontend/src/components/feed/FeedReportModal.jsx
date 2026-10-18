import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormModal, FormSelect, FormTextArea } from '../common';
import { invalidateFeed } from '../../hooks/feedQueries';
import { invalidateStoreNews } from '../../hooks/storeNewsQueries';
import useMessage from '../../hooks/useMessage';
import feedService from '../../services/feedService';
import benefitService from '../../services/benefitService';
import interactionService from '../../services/feedInteractionService';
import { FEED_REPORT_REASONS } from '../../utils/feed';
import { assertCurrentSession, currentSession } from '../../api/sessionScope';

export default function FeedReportModal({ postId, newsId, commentId, onClose }) {
    const [form] = Form.useForm();
    const client = useQueryClient();
    const { message } = useMessage();
    const lock = useRef(false);
    useEffect(() => { if (postId || newsId || commentId) form.resetFields(); }, [postId, newsId, commentId, form]);
    const report = useMutation({
        mutationFn: async ({ values, session }) => {
            assertCurrentSession(session);
            const saved = commentId ? await interactionService.reportComment(commentId, values) : newsId ? await benefitService.report(newsId, values) : await feedService.report(postId, values);
            assertCurrentSession(session); return saved;
        },
        onSuccess: (_, variables) => { assertCurrentSession(variables.session); if (newsId) invalidateStoreNews(client); else invalidateFeed(client); message.success('신고를 접수했어요.'); onClose(); },
        onError: error => { if (!error.isStaleSession) message.error(error.message); },
    });
    const submit = async () => {
        if (lock.current || report.isPending) return;
        lock.current = true; const session = currentSession().epoch;
        try { const values = await form.validateFields(); assertCurrentSession(session); await report.mutateAsync({ values, session }); }
        catch { /* 필드 오류와 서버 오류는 기존 안내를 유지한다. */ }
        finally { lock.current = false; }
    };
    return <FormModal title={commentId ? '댓글 신고' : newsId ? '가게 소식 신고' : '게시물 신고'} open={Boolean(postId || newsId || commentId)} onClose={() => { if (!report.isPending) onClose(); }}
        onSubmit={submit}
        submitting={report.isPending} submitText="신고 접수" rootClassName="reserve-feed-modal">
        <p className="reserve-feed-note">검토를 위해 신고 시점의 {commentId ? '댓글' : '글·사진'}을 별도 보관해요. 신고자의 정보는 작성자에게 공개하지 않아요.</p>
        <Form form={form} layout="vertical" disabled={report.isPending}>
            <Form.Item name="reason" label="신고 이유" rules={[{ required: true, message: '신고 이유를 선택해주세요.' }]}>
                <FormSelect options={FEED_REPORT_REASONS} aria-label="신고 이유" placeholder="이유 선택" />
            </Form.Item>
            <Form.Item name="detail" label="추가 설명" rules={[{ max: 500, message: '설명은 500자 이하로 입력해주세요.' }]}>
                <FormTextArea maxLength={500} rows={4} aria-label="신고 추가 설명" />
            </Form.Item>
        </Form>
    </FormModal>;
}
FeedReportModal.propTypes = { postId: PropTypes.number, newsId: PropTypes.number, commentId: PropTypes.number, onClose: PropTypes.func.isRequired };
