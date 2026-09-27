import React from 'react';
import PropTypes from 'prop-types';

/**
 * 광고 표시 — 가게 카드·목록 행·배너가 모두 이 컴포넌트 하나를 쓴다(2026-09-23).
 *
 * 화면에는 옅은 "AD"로 작게 보이고, 화면 낭독기에는 "광고"로 읽힌다. 진한 "광고" 글자가
 * 가게 이름보다 먼저 눈에 걸려서 옅은 AD로 바꿨다. 글자·색은 CSS(.reserve-ad-mark)가 정한다 —
 * 호출부에서 문구를 따로 쓰지 않는다. 광고성 메일 제목의 "(광고)" 표기는 법정 문구라 이 컴포넌트와 무관하다.
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
