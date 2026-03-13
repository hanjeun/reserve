import { useState } from 'react';
import { Flex } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { colors, radius, fontWeight } from '../../../../styles/tokens';
import { mockInputBase, mockFormLabel } from '../../Home.styles';

export default function MockBookingForm() {
    const [count, setCount] = useState(1);
    const pickerIcon = { color: colors.text.tertiary, fontSize: 14, flexShrink: 0 };

    return (
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: radius['2xl'], padding: '24px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: `1px solid ${colors.border.light}` }}>
            <div style={{ marginBottom: 14 }}>
                <label style={mockFormLabel}>예약 날짜</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between' }}>
                    <span style={{ color: colors.text.tertiary }}>날짜 선택</span>
                    <CalendarOutlined style={pickerIcon} />
                </div>
            </div>
            <div style={{ marginBottom: 14 }}>
                <label style={mockFormLabel}>예약 시간</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between' }}>
                    <span style={{ color: colors.text.tertiary }}>09:00 ~ 22:00</span>
                    <ClockCircleOutlined style={pickerIcon} />
                </div>
            </div>
            <div style={{ marginBottom: 14 }}>
                <label style={mockFormLabel}>인원 수</label>
                <div style={{ ...mockInputBase, justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: fontWeight.medium }}>{count}명</span>
                    <Flex gap={8}>
                        {[
                            { Icon: MinusOutlined, fn: () => setCount(c => Math.max(1, c - 1)), disabled: count <= 1 },
                            { Icon: PlusOutlined,  fn: () => setCount(c => c + 1),               disabled: false },
                        ].map((item, k) => (
                            <button key={k} type="button" onClick={!item.disabled ? item.fn : undefined}
                                style={{ width: 30, height: 30, borderRadius: radius.md, background: colors.gray[100], border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: item.disabled ? 'not-allowed' : 'pointer', opacity: item.disabled ? 0.35 : 1, color: colors.text.secondary }}>
                                <item.Icon style={{ fontSize: 11 }} />
                            </button>
                        ))}
                    </Flex>
                </div>
            </div>
            <div style={{ marginBottom: 16 }}>
                <label style={mockFormLabel}>요청 사항</label>
                <div style={{ position: 'relative', background: colors.gray[50], borderRadius: radius.lg, height: 72, overflow: 'hidden' }}>
                    <span style={{ display: 'block', padding: '10px 12px', color: colors.text.tertiary, fontSize: '14px', lineHeight: 1.6 }}>요청 사항을 입력하세요.</span>
                    <svg style={{ position: 'absolute', bottom: 4, right: 4, opacity: 0.3 }} width="10" height="10" viewBox="0 0 10 10">
                        <path d="M9 1L1 9M9 5L5 9" stroke={colors.text.secondary} strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </div>
            </div>
            <div style={{ height: 46, background: colors.primary.main, borderRadius: radius.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: fontWeight.bold, fontSize: 15 }}>
                예약 신청하기
            </div>
        </div>
    );
}
