import { useState } from 'react';
import { Flex } from 'antd';
import { StarFilled, HeartOutlined, HeartFilled } from '@ant-design/icons';
import { colors, shadows, fontSize, fontWeight, radius } from '../../../../styles/tokens';
import { STORE_DATA } from '../../Home.data';

export default function MockStoreListMobile() {
    const [liked, setLiked] = useState({});

    return (
        <>
            <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {STORE_DATA.map((s, i) => (
                    <div
                        key={i}
                        className="mock-card-m"
                        style={{
                            borderRadius: 0,
                            overflow: 'hidden',
                            border: `1px solid ${colors.border.light}`,
                            boxShadow: shadows.card,
                            background: colors.background.paper,
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ position: 'relative' }}>
                            <div style={{ overflow: 'hidden', lineHeight: 0, margin: 0 }}>
                                <img
                                    src={s.img}
                                    alt={s.name}
                                    className="mock-card-image"
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        objectFit: 'cover',
                                        transition: 'transform 0.3s',
                                        display: 'block',
                                    }}
                                />
                            </div>
                            <div
                                style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}
                                onClick={e => {
                                    e.stopPropagation();
                                    setLiked(l => ({ ...l, [i]: !l[i] }));
                                }}
                            >
                                <div style={{
                                    width: 24, height: 24,
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.88)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                                }}>
                                    {liked[i]
                                        ? <HeartFilled style={{ fontSize: 10, color: colors.error?.main || '#f04452' }} />
                                        : <HeartOutlined style={{ fontSize: 10, color: colors.text.secondary }} />
                                    }
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '8px 8px 10px' }}>
                            <span style={{
                                display: 'inline-block',
                                background: colors.primary.light,
                                color: colors.primary.main,
                                borderRadius: radius.sm,
                                fontSize: 10,
                                fontWeight: fontWeight.medium,
                                padding: '1px 5px',
                                marginBottom: 3,
                            }}>{s.category}</span>
                            <div style={{
                                fontWeight: fontWeight.bold,
                                fontSize: fontSize.xs,
                                color: colors.text.primary,
                                margin: '0 0 3px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>{s.name}</div>
                            <Flex align="center" gap={2}>
                                <StarFilled style={{ color: '#fadb14', fontSize: 10 }} />
                                <span style={{ fontSize: 10, fontWeight: fontWeight.bold, color: colors.text.primary }}>{s.rating.toFixed(1)}</span>
                                <span style={{ fontSize: 10, color: colors.text.secondary }}>({s.reviewCount})</span>
                            </Flex>
                        </div>
                    </div>
                ))}
            </div>
            {/* 클래스명은 Card.jsx의 .reserve-card-image와 겹치지 않게 mock- 접두사를 쓴다. */}
            <style>{`
                .mock-card-m:hover .mock-card-image {
                    transform: scale(1.05);
                }
                @media (prefers-reduced-motion: reduce) {
                    .mock-card-m:hover .mock-card-image {
                        transform: none;
                    }
                }
            `}</style>
        </>
    );
}
