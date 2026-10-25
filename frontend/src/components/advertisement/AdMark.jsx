import React from 'react';
import PropTypes from 'prop-types';

/*
 * 목록의 AD 표시는 화면 낭독기에 광고로 전달한다. 광고성 메일의 법정 제목 문구와는 구분한다.
 */
const AdMark = ({ className = '' }) => (
    <span className={`reserve-ad-mark ${className}`.trim()}>
        <span aria-hidden="true">AD</span>
        <span className="reserve-sr-only">광고</span>
    </span>
);

AdMark.propTypes = {
    className: PropTypes.string,
};

export default AdMark;
