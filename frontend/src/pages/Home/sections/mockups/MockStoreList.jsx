import { useState } from 'react';
import { Flex } from 'antd';
import { StarFilled, HeartOutlined, HeartFilled } from '@ant-design/icons';
import { colors, shadows, fontSize, fontWeight, radius } from '../../../../styles/tokens';
import { STORE_DATA } from '../../Home.data';

export default function MockStoreList() {
    const [liked, setLiked] = useState({});

    return (
        <>
            <div style={{ width: '100%', maxWidth: 380, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {STORE_DATA.map((s, i) => (
                    <div
                        key={i}
                        className="mock-card"
                        style={{
                            borderRadius: 0,
                            overflow: 'hidden',
                            border: `1px solid ${colors.border.light}`,
                            boxShadow: shadows.card,
                            background: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        {/* Card.Cover 구조 완전 동일 */}
                        <div style={{ position: 'relative' }}>
                            <div style={{ overflow: 'hidden', lineHeight: 0, margin: 0 }}>
                                <img
                                    src={s.img}
                                    alt={s.name}
                                    className="card-image"
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        objectFit: 'cover',
                                        transition: 'transform 0.3s',
                                        display: 'block',
                                    }}
                                />
                            </div>
                            {/* 하트 버튼 — top:10 right:10 (StoreCard 동일) */}
                            <div
                                style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}
                                onClick={e => {
                                    e.stopPropagation();
                                    setLiked(l => ({ ...l, [i]: !l[i] }));
                                }}
                            >
                                <div style={{
                                    width: 28, height: 28,
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.88)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                                }}>
                                    {liked[i]
                                        ? <HeartFilled style={{ fontSize: 12, color: colors.error?.main || '#f04452' }} />
                                        : <HeartOutlined style={{ fontSize: 12, color: colors.text.secondary }} />
                                    }
                                </div>
                            </div>
                        </div>

                        {/* 카드 본문 */}
                        <div style={{ padding: '12px 12px 14px' }}>
                            <span style={{
                                display: 'inline-block',
                                background: colors.primary.light,
                                color: colors.primary.main,
                                borderRadius: radius.sm,
                                fontSize: fontSize.xs,
                                fontWeight: fontWeight.medium,
                                padding: '2px 7px',
                                marginBottom: 5,
                            }}>
                                {s.category}
                            </span>
                            <div style={{
                                fontWeight: fontWeight.bold,
                                fontSize: fontSize.sm,
                                color: colors.text.primary,
                                margin: '0 0 4px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {s.name}
                            </div>
                            <Flex align="center" gap={3}>
                                <StarFilled style={{ color: '#fadb14', fontSize: 12 }} />
                                <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.text.primary }}>
                                    {s.rating.toFixed(1)}
                                </span>
                                <span style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>
                                    ({s.reviewCount})
                                </span>
                            </Flex>
                        </div>
                    </div>
                ))}
            </div>

            {/* Card.jsx와 동일한 hover CSS — 이미지만 scale, 카드는 그대로 */}
            <style>{`
                .mock-card:hover .card-image {
                    transform: scale(1.05);
                }
            `}</style>
        </>
    );
}
