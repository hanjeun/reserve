import { useState } from 'react';
import { Typography, Flex } from 'antd';
import { StarFilled, HeartOutlined, HeartFilled } from '@ant-design/icons';
import { colors, radius, shadows, fontSize, fontWeight } from '../../../../styles/tokens';
import { STORE_DATA } from '../../Home.data';

const { Text } = Typography;

export default function MockStoreList() {
    const [hovered, setHovered] = useState(null);
    const [liked, setLiked] = useState({});

    return (
        <div style={{ width: '100%', maxWidth: 380, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {STORE_DATA.map((s, i) => (
                <div
                    key={i}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                        background: '#fff',
                        borderRadius: radius.xl,
                        boxShadow: hovered === i ? shadows.cardHover : shadows.card,
                        border: `1px solid ${colors.border.light}`,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transform: hovered === i ? 'translateY(-2px)' : 'translateY(0)',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                >
                    {/* 이미지 */}
                    <div style={{ width: '100%', aspectRatio: '16 / 10', overflow: 'hidden', background: colors.gray[100], position: 'relative' }}>
                        <img
                            src={s.img}
                            alt={s.name}
                            style={{
                                width: '100%', height: '100%', objectFit: 'cover',
                                transform: hovered === i ? 'scale(1.04)' : 'scale(1)',
                                transition: 'transform 0.35s',
                            }}
                        />
                        {/* 즐겨찾기 버튼 */}
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setLiked(l => ({ ...l, [i]: !l[i] })); }}
                            style={{
                                position: 'absolute', top: 7, right: 7,
                                background: 'rgba(255,255,255,0.85)',
                                border: 'none', borderRadius: '50%',
                                width: 26, height: 26,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer',
                                padding: 0,
                            }}
                        >
                            {liked[i]
                                ? <HeartFilled style={{ fontSize: 12, color: colors.error?.main || '#ff4d4f' }} />
                                : <HeartOutlined style={{ fontSize: 12, color: colors.text.secondary }} />
                            }
                        </button>
                    </div>

                    {/* 정보 */}
                    <div style={{ padding: '10px 11px 12px' }}>
                        <span style={{
                            display: 'inline-block',
                            background: colors.primary.light,
                            color: colors.primary.main,
                            borderRadius: radius.sm,
                            fontSize: fontSize.xs,
                            fontWeight: fontWeight.medium,
                            padding: '2px 7px',
                            marginBottom: 5,
                        }}>{s.category}</span>
                        <div style={{
                            fontWeight: fontWeight.bold,
                            fontSize: fontSize.sm,
                            color: colors.text.primary,
                            marginBottom: 5,
                            lineHeight: 1.3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>{s.name}</div>
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
