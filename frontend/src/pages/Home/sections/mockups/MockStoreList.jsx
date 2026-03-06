import { Typography, Flex } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { colors, radius, shadows, fontSize, fontWeight } from '../../../../styles/tokens';
import { STORE_DATA } from '../../Home.data';

const { Text } = Typography;

export default function MockStoreList() {
    return (
        <div style={{ width: '100%', maxWidth: 380, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {STORE_DATA.map((s, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 0, boxShadow: shadows.card, border: `1px solid ${colors.border.light}`, overflow: 'hidden' }}>
                    <div style={{ width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: colors.gray[100] }}>
                        <img src={s.img} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ padding: '10px 12px 12px' }}>
                        <span style={{ display: 'inline-block', background: colors.primary.light, color: colors.primary.main, borderRadius: radius.sm, fontSize: fontSize.xs, fontWeight: fontWeight.medium, padding: '2px 7px', marginBottom: 5 }}>{s.category}</span>
                        <div style={{ fontWeight: fontWeight.bold, fontSize: fontSize.sm, color: colors.text.primary, marginBottom: 5, lineHeight: 1.3 }}>{s.name}</div>
                        <Flex align="center" gap={3}>
                            <StarFilled style={{ color: '#fadb14', fontSize: 11 }} />
                            <Text strong style={{ fontSize: fontSize.xs }}>{s.rating.toFixed(1)}</Text>
                            <Text type="secondary" style={{ fontSize: fontSize.xs }}>({s.reviewCount})</Text>
                        </Flex>
                    </div>
                </div>
            ))}
        </div>
    );
}
