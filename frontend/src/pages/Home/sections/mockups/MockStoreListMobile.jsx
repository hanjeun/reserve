import { Typography, Flex } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { colors, radius, shadows, fontWeight } from '../../../../styles/tokens';
import { STORE_DATA } from '../../Home.data';

const { Text } = Typography;

export default function MockStoreListMobile() {
    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STORE_DATA.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: radius.lg, padding: '10px', boxShadow: shadows.card, border: `1px solid ${colors.border.light}` }}>
                    <div style={{ width: 52, height: 52, borderRadius: radius.md, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 }}>
                        <img src={s.img} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'inline-block', background: colors.primary.light, color: colors.primary.main, borderRadius: radius.sm, fontSize: 10, fontWeight: fontWeight.medium, padding: '1px 5px', marginBottom: 3 }}>{s.category}</span>
                        <div style={{ fontWeight: fontWeight.bold, fontSize: 13, color: colors.text.primary, lineHeight: 1.3, marginBottom: 3 }}>{s.name}</div>
                        <Flex align="center" gap={3}>
                            <StarFilled style={{ color: '#fadb14', fontSize: 10 }} />
                            <Text strong style={{ fontSize: 11 }}>{s.rating.toFixed(1)}</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>({s.reviewCount})</Text>
                        </Flex>
                    </div>
                </div>
            ))}
        </div>
    );
}
