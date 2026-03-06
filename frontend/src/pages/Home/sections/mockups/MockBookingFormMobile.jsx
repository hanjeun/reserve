import { useState } from 'react';
import { Flex } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { colors, radius, fontWeight } from '../../../../styles/tokens';
import { mockInputBase, mockFormLabel } from '../../Home.styles';

export default function MockBookingFormMobile() {
    const [count, setCount] = useState(1);
    const inputH = { ...mockInputBase, height: 42, fontSize: 13 };
    const pickerIcon = { color: colors.text.tertiary, fontSize: 13 };

    return (
        <div style={{ width: '100%', background: '#fff', borderRadius: radius['2xl'], padding: '18px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: `1px solid ${colors.border.light}` }}>
            <div style={{ marginBottom: 10 }}>
                <label style={{ ...mockFormLabel, fontSize: 12 }}>예약 날짜</label>
                <div style={{ ...inputH, justifyContent: 'space-between' }}>
                    <span style={{ color: colors.text.tertiary }}>날짜 선택</span>
                    <CalendarOutlined style={pickerIcon} />
                </div>
            </div>
            <div style={{ marginBottom: 10 }}>
                <label style={{ ...mockFormLabel, fontSize: 12 }}>예약 시간</label>
                <div style={{ ...inputH, justifyContent: 'space-between' }}>
                    <span style={{ color: colors.text.tertiary }}>09:00 ~ 22:00</span>
                    <ClockCircleOutlined style={pickerIcon} />
                </div>
            </div>
            <div style={{ marginBottom: 10 }}>
                <label style={{ ...mockFormLabel, fontSize: 12 }}>인원 수</label>
                <div style={{ ...inputH, justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: fontWeight.medium }}>{count}명</span>
                    <Flex gap={6}>
                        {[
                            { Icon: MinusOutlined, fn: () => setCount(c => Math.max(1, c - 1)), disabled: count <= 1 },
                            { Icon: PlusOutlined,  fn: () => setCount(c => c + 1),               disabled: false },
                        ].map(({ Icon, fn, disabled }, k) => (
                            <button key={k} type="button" onClick={!disabled ? fn : undefined}
                                style={{ width: 26, height: 26, borderRadius: radius.md, background: colors.gray[100], border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1, color: colors.text.secondary }}>
                                <Icon style={{ fontSize: 10 }} />
                            </button>
                        ))}
                    </Flex>
                </div>
            </div>
            <div style={{ marginBottom: 12 }}>
                <label style={{ ...mockFormLabel, fontSize: 12 }}>요청 사항</label>
                <div style={{ position: 'relative', background: colors.gray[50], borderRadius: radius.lg, height: 54, overflow: 'hidden' }}>
                    <span style={{ display: 'block', padding: '8px 12px', color: colors.text.tertiary, fontSize: 13 }}>요청 사항을 입력하세요.</span>
                </div>
            </div>
            <div style={{ height: 40, background: colors.primary.main, borderRadius: radius.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: fontWeight.bold, fontSize: 14 }}>
                예약 신청하기
            </div>
        </div>
    );
}
