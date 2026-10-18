import PropTypes from 'prop-types';

/** 신고·심사 주 목록의 전환/건수와 상태 필터를 같은 배치 관문에 둔다. */
export default function ManagementListToolbar({ leading, trailing, refresh }) {
    return <div className={'reserve-management-toolbar' + (trailing || refresh ? ' reserve-management-toolbar--with-controls' : '')}>
        <div className="reserve-management-toolbar-leading">{leading}</div>
        {(trailing || refresh) && <div className="reserve-management-toolbar-trailing">{trailing}{refresh}</div>}
    </div>;
}
ManagementListToolbar.propTypes = { leading: PropTypes.node, trailing: PropTypes.node, refresh: PropTypes.node };
