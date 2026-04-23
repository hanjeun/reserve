import { useState, useRef } from 'react';
import { Flex } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { colors, radius, fontWeight, heights, fontSize } from '../../../../styles/tokens';
import { Button } from '../../../../components/common';
import { mockInputBase, mockFormLabel } from '../../Home.styles';

export default function MockBookingForm() {
    const [count, setCount] = useState(1);
    const [text, setText] = useState('');
    const [pressed, setPressed] = useState(false);
    const textareaRef = useRef(null);
    const pickerIcon = { color: colors.text.tertiary, fontSize: 14, flexShrink: 0 };

    return (
        <div style={{
            width: '100%', maxWidth: 360,
            background: '#fff',
            borderRadius: radius['2xl'],
            padding: '28px 24px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            border: `1px solid ${colors.border.light}`,
        }}>
            {/* 예약 날짜 — 표시만 */}
            <div style={{ marginBottom: 16 }}>
                <label style={mockFormLabel}>예약 날짜</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between', cursor: 'not-allowed' }}>
                    <span style={{ color: colors.text.tertiary }}>날짜 선택</span>
                    <CalendarOutlined style={pickerIcon} />
                </div>
            </div>

            {/* 예약 시간 — 표시만 */}
            <div style={{ marginBottom: 16 }}>
                <label style={mockFormLabel}>예약 시간</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between', cursor: 'not-allowed' }}>
                    <span style={{ color: colors.text.tertiary }}>09:00 ~ 22:00</span>
                    <ClockCircleOutlined style={pickerIcon} />
                </div>
            </div>

            {/* 인원 수 — 실제 동작 */}
            <div style={{ marginBottom: 16 }}>
                <label style={mockFormLabel}>인원 수</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: fontWeight.medium, fontSize: fontSize.base }}>{count}명</span>
                    <Flex gap={8}>
                        {[
                            { Icon: MinusOutlined, fn: () => setCount(c => Math.max(1, c - 1)), disabled: count <= 1 },
                            { Icon: PlusOutlined,  fn: () => setCount(c => c + 1), disabled: false },
                        ].map((item, k) => (
                            <button
                                key={k}
                                type="button"
                                onClick={!item.disabled ? item.fn : undefined}
                                style={{
                                    width: 32, height: 32,
                                    borderRadius: radius.md,
                                    background: colors.gray[100],
                                    border: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                                    opacity: item.disabled ? 0.35 : 1,
                                    color: colors.text.secondary,
                                    transition: 'background 0.15s',
                                    flexShrink: 0,
                                }}
                                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = colors.gray[200]; }}
                                onMouseLeave={e => { e.currentTarget.style.background = colors.gray[100]; }}
                            >
                                <item.Icon style={{ fontSize: 11 }} />
                            </button>
                        ))}
                    </Flex>
                </div>
            </div>

            {/* 요청 사항 — 실제 입력 가능 */}
            <div style={{ marginBottom: 20 }}>
                <label style={mockFormLabel}>요청 사항</label>
                <div
                    style={{
                        position: 'relative',
                        background: colors.gray[50],
                        borderRadius: radius.lg,
                        overflow: 'hidden',
                    }}
                    onClick={() => textareaRef.current?.focus()}
                >
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        maxLength={200}
                        style={{
                            width: '100%',
                            height: 76,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            resize: 'none',
                            padding: '10px 14px',
                            fontSize: '14px',
                            lineHeight: 1.6,
                            color: colors.text.primary,
                            boxSizing: 'border-box',
                            fontFamily: 'inherit',
                        }}
                        placeholder="요청 사항을 입력하세요."
                    />
                    <svg
                        style={{ position: 'absolute', bottom: 5, right: 5, opacity: 0.2, pointerEvents: 'none' }}
                        width="10" height="10" viewBox="0 0 10 10"
                    >
                        <path d="M9 1L1 9M9 5L5 9" stroke={colors.text.secondary} strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </div>
            </div>

            {/* 예약 신청하기 — 디자인 시스템 Button, active 시 scale */}
            <Button
                variant="primary"
                size="lg"
                block
                htmlType="button"
                onMouseDown={() => setPressed(true)}
                onMouseUp={() => setPressed(false)}
                onMouseLeave={() => setPressed(false)}
                style={{
                    borderRadius: radius.lg,
                    transform: pressed ? 'scale(0.97)' : 'scale(1)',
                    transition: 'transform 0.12s, opacity 0.12s',
                }}
            >
                예약 신청하기
            </Button>
        </div>
    );
}
