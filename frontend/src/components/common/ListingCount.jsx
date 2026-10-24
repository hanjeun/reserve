import PropTypes from 'prop-types';
import { Typography } from 'antd';

export default function ListingCount({ children }) {
    return <Typography.Text className="reserve-explore-count" type="secondary">{children}</Typography.Text>;
}
ListingCount.propTypes = { children: PropTypes.node.isRequired };
