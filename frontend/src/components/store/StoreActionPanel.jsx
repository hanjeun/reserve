import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { colors, fontWeight, radius } from '../../styles/tokens';

export default function StoreActionPanel({ title, isPC = false, children }) {
    return <div style={isPC ? panelStyle : undefined}>
        <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 20, fontWeight: fontWeight.bold }}>
            {title}
        </Typography.Title>
        {children}
    </div>;
}

StoreActionPanel.propTypes = {
    title: PropTypes.node.isRequired,
    isPC: PropTypes.bool,
    children: PropTypes.node,
};

const panelStyle = {
    background: colors.background.paper,
    borderRadius: radius.xl,
    border: `1px solid ${colors.border.light}`,
    padding: '28px 24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
};
