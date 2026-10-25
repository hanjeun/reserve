import PropTypes from 'prop-types';

/** 목록 안내는 결과 앞에 두되, 빈 상태의 공통 여백 안에 함께 배치한다. */
export default function ListingContent({ notice, children }) {
    return <div className="reserve-listing-content">
        <div className="reserve-listing-content__notice">{notice}</div>
        <div className="reserve-listing-content__results">{children}</div>
    </div>;
}

ListingContent.propTypes = { notice: PropTypes.node, children: PropTypes.node };
