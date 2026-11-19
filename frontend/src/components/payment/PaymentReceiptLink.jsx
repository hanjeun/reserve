import PropTypes from 'prop-types';
import TextLink from '../common/TextLink';

export default function PaymentReceiptLink({ href }) {
    return <TextLink href={href} target="_blank" rel="noopener noreferrer">영수증 보기</TextLink>;
}

PaymentReceiptLink.propTypes = { href: PropTypes.string.isRequired };
