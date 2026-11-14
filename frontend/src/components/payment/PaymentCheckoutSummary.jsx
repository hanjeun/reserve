import PropTypes from 'prop-types';
import DetailInfoRows from '../common/DetailInfoRows';
import { CreditCardOutlined } from '../common/icons';

export default function PaymentCheckoutSummary({ label, rows, title = '결제 금액', amountLabel, methodLabel, children }) {
    return <>
        <section aria-label={label} className="reserve-payment-section reserve-payment-overview">
            <DetailInfoRows rows={rows} />
        </section>
        <aside className="reserve-payment-total" aria-label="결제 금액 확인">
            <h3>{title}</h3>
            {methodLabel && <DetailInfoRows rows={[{ Icon: CreditCardOutlined, label: '결제 수단', value: methodLabel }]} />}
            <div className="reserve-payment-amount"><span>총 결제 금액</span><strong>{amountLabel}</strong></div>
            {children}
        </aside>
    </>;
}

PaymentCheckoutSummary.propTypes = {
    label: PropTypes.string.isRequired, rows: PropTypes.array.isRequired, title: PropTypes.string,
    amountLabel: PropTypes.string.isRequired, methodLabel: PropTypes.string, children: PropTypes.node,
};
