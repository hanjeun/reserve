import React from 'react';

/*
 * 목록의 AD 표시는 화면 낭독기에 광고로 전달한다. 광고성 메일의 법정 제목 문구와는 구분한다.
 */
const AdMark = () => (
    <span className="reserve-ad-mark">
        <span aria-hidden="true">AD</span>
        <span className="reserve-sr-only">광고</span>
    </span>
);

export default AdMark;
