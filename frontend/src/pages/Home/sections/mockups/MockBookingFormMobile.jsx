import { useState } from 'react';
import { Flex } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { colors, radius, fontWeight, heights, fontSize, field, fieldPx } from '../../../../styles/tokens';
import { mockInputBase, mockFormLabel } from '../../Home.styles';

const SECTION_BG = '#f8f9fa';

export default function MockBookingFormMobile() {
    const [count, setCount] = useState(1);
    const pickerIcon = { color: colors.text.tertiary, fontSize: 13, flexShrink: 0 };

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: 360,
            overflow: 'hidden',
            borderRadius: radius['2xl'],
            background: colors.background.paper,
            border: `1px solid ${colors.border.light}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
            <div style={{ padding: '18px 18px 20px' }}>
                <div style={{ marginBottom: 10 }}>
                    <label style={{ ...mockFormLabel, fontSize: 12 }}>예약 날짜</label>
                    <div style={{ ...mockInputBase, height: heights.input, justifyContent: 'space-between', cursor: 'not-allowed' }}>
                        <span style={{ color: colors.text.tertiary }}>날짜 선택</span>
                        <CalendarOutlined style={pickerIcon} />
                    </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                    <label style={{ ...mockFormLabel, fontSize: 12 }}>예약 시간</label>
                    <div style={{ ...mockInputBase, height: heights.input, justifyContent: 'space-between', cursor: 'not-allowed' }}>
                        <span style={{ color: colors.text.tertiary }}>09:00 ~ 22:00</span>
                        <ClockCircleOutlined style={pickerIcon} />
                    </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                    <label style={{ ...mockFormLabel, fontSize: 12 }}>인원 수</label>
                    <div style={{ ...mockInputBase, height: heights.input, justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: fontWeight.medium, fontSize: fontSize.base }}>{count}명</span>
                        <Flex gap={6}>
                            {[
                                { Icon: MinusOutlined, fn: () => setCount(c => Math.max(1, c - 1)), disabled: count <= 1 },
                                { Icon: PlusOutlined,  fn: () => setCount(c => c + 1), disabled: false },
                            ].map((item, k) => (
                                <button key={k} type="button" onClick={!item.disabled ? item.fn : undefined}
                                    style={{ width: 30, height: 30, borderRadius: radius.md, background: colors.gray[100], border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: item.disabled ? 'not-allowed' : 'pointer', opacity: item.disabled ? 0.35 : 1, color: colors.text.secondary, transition: 'background 0.15s', flexShrink: 0 }}
                                    onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = colors.gray[200]; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = colors.gray[100]; }}>
                                    <item.Icon style={{ fontSize: 10 }} />
                                </button>
                            ))}
                        </Flex>
                    </div>
                </div>
                <div>
                    <label style={{ ...mockFormLabel, fontSize: 12 }}>요청 사항</label>
                    <div style={{ background: colors.gray[50], borderRadius: field.radius, height: fieldPx(field.height), display: 'flex', alignItems: 'flex-start', padding: '10px 14px' }}>
                        <span style={{ color: colors.text.tertiary, fontSize: 13 }}>요청 사항을 입력하세요.</span>
                    </div>
                </div>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, background: `linear-gradient(to bottom, rgba(248,249,250,0) 0%, ${SECTION_BG} 75%)`, pointerEvents: 'none' }} />
        </div>
    );
}
