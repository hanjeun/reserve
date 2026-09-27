import React from 'react';
import PropTypes from 'prop-types';
import AdMark from '../advertisement/AdMark';

const StoreIdentityText = ({ category, isAdvertised = false, nearby = false }) => (
    <span className="reserve-store-identity-text">
        <span>{category || '기타'}</span>
        {isAdvertised && <AdMark className="reserve-store-identity-text-ad" />}
        {nearby && <span>우리동네</span>}
    </span>
);

StoreIdentityText.propTypes = {
    category: PropTypes.string,
    isAdvertised: PropTypes.bool,
    nearby: PropTypes.bool,
};

export default StoreIdentityText;
