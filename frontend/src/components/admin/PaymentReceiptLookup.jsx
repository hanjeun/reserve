import { useId } from 'react';
import { Form } from 'antd';
import PropTypes from 'prop-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, DataState, FormInput, FormSelect } from '../common';
import CopyableText from '../common/CopyableText';
import DetailInfoRows from '../common/DetailInfoRows';
import { CopyOutlined, FileTextOutlined, SearchOutlined } from '../common/icons';
import PaymentReceiptLink from '../payment/PaymentReceiptLink';
import { adminKeys } from '../../hooks/queryKeys';
import paymentService from '../../services/paymentService';
import useAuthStore from '../../store/useAuthStore';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { paymentReceiptHref } from '../../utils/paymentReceipt';

const TYPES = [{ value: 'reservation', label: '예약금' }, { value: 'ad', label: '광고 결제' }];
const inquiryIdRule = {
    required: true,
    validator: (_, value) => /^[1-9][0-9]*$/.test(value?.trim()) && Number.isSafeInteger(Number(value))
        ? Promise.resolve() : Promise.reject(new Error('문의 번호를 숫자로 입력해주세요.')),
};

export default function PaymentReceiptLookup() {
    const revision = useAuthStore(state => state.sessionRevision);
    return <ReceiptLookupForm key={revision} />;
}

function ReceiptLookupForm() {
    const noticeId = useId();
    const client = useQueryClient();
    const lookup = useMutation({
        gcTime: 0,
        mutationFn: async values => {
            const request = { type: values.type, merchantUid: values.merchantUid.trim(), inquiryId: Number(values.inquiryId) };
            const result = await paymentService.lookupReceipt(request);
            if (result?.type !== request.type || result.merchantUid !== request.merchantUid) {
                throw new Error('요청한 주문의 영수증 정보를 확인하지 못했어요.');
            }
            return result;
        },
        onSettled: () => { void client.invalidateQueries({ queryKey: adminKeys.auditLogs() }); },
    });
    const result = !lookup.isPending && lookup.data;
    const href = paymentReceiptHref(result?.receiptUrl);
    return <section aria-label="영수증 조회" className="reserve-payment-receipt-lookup">
        <p id={noticeId} className="reserve-payment-operations-notice">로그인한 고객이 문의에 남긴 주문의 영수증을 확인할 수 있어요.</p>
        <Form name="payment-receipt" layout="vertical" requiredMark={false} initialValues={{ type: 'reservation' }}
            aria-describedby={noticeId} onFinish={values => { if (!lookup.isPending) lookup.mutate(values); }} onValuesChange={() => lookup.reset()}>
            <Form.Item name="type" label="결제 유형">
                <FormSelect aria-label="결제 유형" options={TYPES} disabled={lookup.isPending} />
            </Form.Item>
            <Form.Item name="merchantUid" label="주문번호" rules={[{ required: true, whitespace: true, message: '주문번호를 입력해주세요.' }]}>
                <FormInput placeholder="고객이 문의에 적은 주문번호" disabled={lookup.isPending} maxLength={255} autoComplete="off" />
            </Form.Item>
            <Form.Item name="inquiryId" label="문의 번호" rules={[inquiryIdRule]}>
                <FormInput placeholder="관리자 메일함의 문의 번호" disabled={lookup.isPending} inputMode="numeric" autoComplete="off" maxLength={16} />
            </Form.Item>
            <Button block htmlType="submit" icon={<SearchOutlined />} loading={lookup.isPending}>조회하기</Button>
        </Form>
        {lookup.isError && <DataState compact state="error" kind="payment" requestType="detail" subject="영수증"
            title={httpStatusOf(lookup.error) === 404 ? '주문번호와 문의를 대조하지 못했어요.' : undefined} error={lookup.error} />}
        <div aria-live="polite">{result && <ReceiptLookupResult result={result} href={href} />}</div>
    </section>;
}

function ReceiptLookupResult({ result, href }) {
    const params = new URLSearchParams({ type: result.type, merchant_uid: result.merchantUid });
    const customerLink = new URL(`/payment/result?${params}`, window.location.origin).href;
    return <section aria-label="영수증 조회 결과" className="reserve-payment-receipt-lookup__result">
        <h2>조회 결과</h2>
        <DetailInfoRows rows={[
            { Icon: FileTextOutlined, label: '주문번호', value: <CopyableText value={result.merchantUid} label="주문번호" wrap /> },
            { Icon: FileTextOutlined, label: '영수증', value: href ? <PaymentReceiptLink href={href} /> : '결제사에서 제공한 영수증 링크가 없어요.' },
            ...(href ? [{ Icon: CopyOutlined, label: '고객 확인 링크', value: <CopyableText value={customerLink} label="고객 확인 링크" wrap /> }] : []),
        ]} />
    </section>;
}

ReceiptLookupResult.propTypes = { result: PropTypes.object.isRequired, href: PropTypes.string };
