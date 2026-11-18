import PropTypes from 'prop-types';

export default function ReservationCompletionNotice({ text }) {
    return <p className="reserve-reservation-completion" role="status">{text}</p>;
}

ReservationCompletionNotice.propTypes = {
    text: PropTypes.string,
};
