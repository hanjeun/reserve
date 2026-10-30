import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Checkbox, Typography } from 'antd';
import FormModal from '../common/FormModal';
import Button from '../common/Button';
import UnderlinedTextButton from '../common/UnderlinedTextButton';
import CopyableText from '../common/CopyableText';
import DetailInfoRows from '../common/DetailInfoRows';
import AnimatedContent from '../common/AnimatedContent';
import Tooltip from '../common/Tooltip';
import TextLink from '../common/TextLink';
import PaymentBrandIcon from './PaymentBrandIcon';
import { CalendarOutlined, ClockCircleOutlined, CreditCardOutlined, FileTextOutlined, TeamOutlined, UserOutlined, CheckCircleOutlined, SafetyCertificateOutlined, DownOutlined, ShopOutlined } from '../common/icons';
import { CARD_COMPANIES, cardCompanyLabel, cardCompanySupported, paymentMethodAvailability, paymentMethodBrand, readPaymentDevice } from '../../utils/paymentMethods';

const { Paragraph } = Typography;
const choiceStyle = { height: 'auto', border: '1px solid var(--reserve-payment-choice-border, transparent)', color: 'var(--reserve-payment-choice-text, var(--c-text-secondary))' };
const reservationRows = (prepared, summary) => [
    { Icon: ShopOutlined, label: summary.kind === 'RESERVATION' ? '가게' : '상품', value: summary.storeName || prepared.productName },
    { Icon: FileTextOutlined, label: '예약번호', value: summary.reservationCode && <CopyableText value={summary.reservationCode} label="예약번호" /> },
    { Icon: CalendarOutlined, label: '예약 날짜', value: summary.reservationDate },
    { Icon: ClockCircleOutlined, label: '예약 시간', value: summary.reservationTime?.slice(0, 5) },
    { Icon: TeamOutlined, label: '인원', value: summary.guestCount != null ? summary.guestCount + '명' : null },
    { Icon: UserOutlined, label: summary.kind === 'RESERVATION' ? '예약자' : '결제자', value: prepared.buyerName },
].filter(row => row.value != null && row.value !== '');

function CardCompanyPicker({ selected, onChange, provider }) {
    const [expanded, setExpanded] = useState(false);
    const groupId = useId();
    const companyButton = company => <Tooltip key={company.code} title={cardCompanySupported(company.code, provider) ? null : 'KCP 직접 호출 지원이 확인되지 않은 카드예요.'}>
        <Button variant="secondary" size="md" style={choiceStyle} disabled={!cardCompanySupported(company.code, provider)}
            className="reserve-payment-card-company" aria-pressed={selected === company.code} onClick={() => onChange(company.code)}>{company.label}</Button>
    </Tooltip>;
    return <div className="reserve-payment-card-picker">
        <h4>카드사 선택 <span>일시불</span></h4>
        <div role="group" aria-label="카드사 선택">
            <div className="reserve-payment-card-companies">{CARD_COMPANIES.slice(0, 9).map(companyButton)}</div>
            <div id={groupId} className={'reserve-payment-expand' + (expanded ? ' is-open' : '')} aria-hidden={!expanded} inert={!expanded ? true : undefined}>
                <div className="reserve-payment-expand-inner"><div className="reserve-payment-card-companies reserve-payment-card-extra">{CARD_COMPANIES.slice(9).map(companyButton)}</div></div>
            </div>
        </div>
        <div className="reserve-payment-more-wrap"><UnderlinedTextButton className="reserve-payment-more"
            aria-label={expanded ? '카드사 접기' : '카드사 더 보기'} aria-expanded={expanded} aria-controls={groupId}
            onClick={event => { event.currentTarget.focus({ preventScroll: true }); setExpanded(value => !value); }}>
            {expanded ? '접기' : '더 보기'}<DownOutlined className="reserve-filter-menu-chevron" aria-hidden="true" />
        </UnderlinedTextButton></div>
    </div>;
}
CardCompanyPicker.propTypes = { selected: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, provider: PropTypes.string };

function MethodOption({ method, selected, onChange, device }) {
    const hintId = useId();
    const status = paymentMethodAvailability(method, device);
    return <Tooltip title={status.available ? null : status.reason}>
        <span className="reserve-payment-method-anchor" tabIndex={!status.available ? 0 : undefined}
            role={!status.available ? 'group' : undefined} aria-disabled={!status.available || undefined} aria-label={!status.available ? method.label : undefined}
            aria-describedby={!status.available ? hintId : undefined}>
            <Button variant="secondary" size="md" style={choiceStyle} className="reserve-payment-method" disabled={!status.available}
                aria-label={method.label + (method.testOnly ? ' TEST' : '')} aria-pressed={selected}
                aria-describedby={!status.available ? hintId : undefined}
                onClick={event => { event.currentTarget.focus({ preventScroll: true }); onChange(method.id); }}>
                <span className="reserve-payment-method-heading"><span className="reserve-payment-brand-mark"><PaymentBrandIcon brand={paymentMethodBrand(method)} /></span>
                    <span>{method.label}</span>{method.testOnly && <small>TEST</small>}</span>
            </Button>
            {!status.available && <span id={hintId} className="reserve-sr-only">{status.reason}</span>}
        </span>
    </Tooltip>;
}
MethodOption.propTypes = { method: PropTypes.object.isRequired, selected: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired, device: PropTypes.object.isRequired };

export default function PaymentMethodDialog({ open, prepared, summary = {}, methods, selectedId, onChange, onConfirm, onClose, afterClose, paymentDevice, onViewTerms }) {
    const [cardCompany, setCardCompany] = useState('');
    const [acknowledged, setAcknowledged] = useState(false);
    const device = paymentDevice || readPaymentDevice();
    const selected = methods.find(method => method.id === selectedId);
    const availability = selected ? paymentMethodAvailability(selected, device) : { available: false };
    const card = selected?.payMethod === 'CARD';
    const naverPointsOnly = selected?.testOnly && selected.pgProvider === 'kcp_v2' && paymentMethodBrand(selected) === 'NAVERPAY';
    const ready = acknowledged && selected && availability.available && (!card || cardCompanySupported(cardCompany, selected.pgProvider));
    const amount = Number(prepared.amount).toLocaleString('ko-KR') + '원';
    const reservation = summary.kind === 'RESERVATION';
    const selectedLabel = card && cardCompanyLabel(cardCompany) ? '카드 · ' + cardCompanyLabel(cardCompany) : selected?.label || '선택해주세요.';
    const confirm = () => { if (ready) onConfirm(card ? { ...selected, cardCompany } : selected); };
    return <FormModal title={reservation ? '예약 및 결제 확인' : '결제 정보 확인'} open={open}
        rootClassName="reserve-payment-modal" onClose={onClose} afterClose={afterClose}
        onSubmit={confirm} submitText={amount + ' 결제하기'} submitDisabled={!ready} width={820}
        footer={<div className="reserve-payment-footer">
            <Checkbox checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}>
                [필수] {reservation ? '예약' : '주문'} 내용과 <TextLink to="/terms#payments" onClick={event => {
                    event.stopPropagation();
                    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onViewTerms?.();
                }}>결제·취소·환불 안내</TextLink>를 확인했어요.
            </Checkbox>
            <Button variant="primary" size="sm" disabled={!ready} onClick={confirm}>{amount} 결제하기</Button>
        </div>}>
        <div className="reserve-payment-bridge">
            <section aria-label={reservation ? '예약 정보' : '주문 정보'} className="reserve-payment-section reserve-payment-overview">
                <DetailInfoRows rows={reservationRows(prepared, summary)} />
            </section>
            <aside className="reserve-payment-total" aria-label="결제 금액 확인">
                <h3>{summary.attendanceRefundEnabled ? '예약 보증금' : '결제 금액'}</h3>
                <DetailInfoRows rows={[{ Icon: CreditCardOutlined, label: '결제 수단', value: selectedLabel }]} />
                <div className="reserve-payment-amount"><span>총 결제 금액</span><strong>{amount}</strong></div>
                {summary.attendanceRefundEnabled && <p className="reserve-payment-policy"><CheckCircleOutlined aria-hidden="true" />
                    <span>QR 체크인 후 이용을 마치면 보증금 전액을 환불해요.</span></p>}
                <p className="reserve-payment-policy"><SafetyCertificateOutlined aria-hidden="true" /><span>결제 인증은 결제사 화면에서 진행해요.</span></p>
            </aside>
            <section aria-label="결제 방법" className="reserve-payment-section reserve-payment-selection">
                <h3>결제 방법</h3>
                <div className="reserve-payment-methods" role="group" aria-label="결제 수단 선택">
                    {methods.map(method => <MethodOption key={method.id} method={method} selected={method.id === selectedId} onChange={onChange} device={device} />)}
                </div>
                <AnimatedContent motionKey={selectedId || 'none'} className="reserve-payment-method-detail">
                    <div className={'reserve-payment-expand' + (card ? ' is-open' : '')} aria-hidden={!card} inert={!card ? true : undefined}>
                        <div className="reserve-payment-expand-inner"><CardCompanyPicker selected={cardCompany} onChange={setCardCompany} provider={selected?.pgProvider} /></div>
                    </div>
                    {(!availability.available && selected || selected?.testOnly) && <Paragraph type="secondary" className="reserve-payment-method-note">
                        {!availability.available && selected ? availability.reason
                            : naverPointsOnly ? <>네이버페이 TEST는 테스트 계정의 포인트로만 결제할 수 있어요.{' '}
                                <TextLink href="https://developers.pay.naver.com/user/sand-box/paypoint" target="_blank" rel="noopener noreferrer">테스트용 포인트 받기</TextLink></>
                            : 'TEST 연결을 시험하는 수단이에요. 결제사 설정에 따라 제한될 수 있어요.'}
                    </Paragraph>}
                </AnimatedContent>
            </section>
        </div>
    </FormModal>;
}
PaymentMethodDialog.propTypes = {
    open: PropTypes.bool, prepared: PropTypes.object.isRequired, summary: PropTypes.object,
    methods: PropTypes.array.isRequired, selectedId: PropTypes.string, onChange: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired, afterClose: PropTypes.func, paymentDevice: PropTypes.object, onViewTerms: PropTypes.func,
};
