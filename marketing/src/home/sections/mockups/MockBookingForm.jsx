import { Flex } from '../../../primitives.jsx';
import { CalendarOutlined, ClockCircleOutlined, PlusOutlined, MinusOutlined } from '../../../../../frontend/src/components/common/icons.js';
import { colors, shadows, radius, fontWeight, fontSize } from '../../../../../frontend/src/styles/tokens/index.js';
import Button from '../../../../../frontend/src/components/common/Button.jsx';
import { mockInputBase, mockFormLabel } from '../../Home.styles';

export default function MockBookingForm() {
    const count = 1;
    const pickerIcon = { color: colors.text.tertiary, fontSize: 14, flexShrink: 0 };

    return (
        <div style={{
            width: '100%', maxWidth: 360,
            background: colors.background.paper,
            borderRadius: radius['2xl'],
            padding: 'clamp(18px, 4vw, 28px) clamp(16px, 4vw, 24px)',
            boxShadow: shadows.card,
            border: `1px solid ${colors.border.light}`,
            boxSizing: 'border-box',
        }}>

            <div style={{ marginBottom: 16 }}>
                <label style={mockFormLabel}>예약 날짜</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between', cursor: 'not-allowed' }}>
                    <span style={{ color: colors.text.tertiary }}>날짜 선택</span>
                    <CalendarOutlined style={pickerIcon} />
                </div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <label style={mockFormLabel}>예약 시간</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between', cursor: 'not-allowed' }}>
                    <span style={{ color: colors.text.tertiary }}>09:00 ~ 22:00</span>
                    <ClockCircleOutlined style={pickerIcon} />
                </div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <label style={mockFormLabel}>인원 수</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between' }}>
                    <span data-demo-count style={{ fontWeight: fontWeight.medium, fontSize: fontSize.base }}>{count}명</span>
                    <Flex gap={8}>
                        {[
                            { Icon: MinusOutlined, disabled: count <= 1 },
                            { Icon: PlusOutlined,  disabled: false },
                        ].map((item, k) => (
                            <button className="marketing-stepper" data-demo-delta={k === 0 ? -1 : 1} disabled={item.disabled}
                                key={k}
                                type="button"
                                style={{
                                    width: 32, height: 32,
                                    borderRadius: radius.md,
                                    background: colors.gray[100],
                                    border: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',

                                    color: colors.text.secondary,
                                    transition: 'background 0.15s',
                                    flexShrink: 0,
                                }}

                            >
                                <item.Icon style={{ fontSize: 11 }} />
                            </button>
                        ))}
                    </Flex>
                </div>
            </div>

            <div style={{ marginBottom: 20 }}>
                <label style={mockFormLabel}>요청 사항</label>
                <div
                    style={{
                        position: 'relative',
                        background: colors.gray[50],
                        borderRadius: radius.lg,
                        overflow: 'hidden',
                    }}
                >
                    <textarea
                        defaultValue=""
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

            <Button
                variant="primary"
                size="lg"
                block
                htmlType="button"
            >
                예약 신청하기
            </Button>
        </div>
    );
}
