import PropTypes from 'prop-types';
import { CreditCardOutlined } from '../common/icons';
import naverpay from '../../assets/payment-brands/naverpay.svg';
import kakaopay from '../../assets/payment-brands/kakaopay.png';
import tosspay from '../../assets/payment-brands/tosspay.svg';
import samsungpay from '../../assets/payment-brands/samsungpay.svg';
import applepay from '../../assets/payment-brands/applepay.svg';

const dimensions = { NAVERPAY: [30, 30], KAKAOPAY: [48, 20], TOSSPAY: [56, 11], SAMSUNGPAY: [30, 30], APPLEPAY: [30, 30] };
const logos = { NAVERPAY: naverpay, KAKAOPAY: kakaopay, TOSSPAY: tosspay, SAMSUNGPAY: samsungpay, APPLEPAY: applepay };
export default function PaymentBrandIcon({ brand }) {
    if (brand === 'CARD') return <CreditCardOutlined aria-hidden="true" />;
    return logos[brand] ? <img className={"reserve-payment-brand-icon" + (["SAMSUNGPAY", "APPLEPAY"].includes(brand) ? " reserve-payment-brand-icon--monochrome" : "")} src={logos[brand]} width={dimensions[brand][0]} height={dimensions[brand][1]} alt="" aria-hidden="true" /> : null;
}
PaymentBrandIcon.propTypes = { brand: PropTypes.string.isRequired };
