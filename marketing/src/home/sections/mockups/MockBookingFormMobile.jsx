import { Flex } from '../../../primitives.jsx';
import { CalendarOutlined, ClockCircleOutlined, PlusOutlined, MinusOutlined } from '../../../../../frontend/src/components/common/icons.js';
import { colors, shadows, radius, fontWeight, heights, fontSize } from '../../../../../frontend/src/styles/tokens/index.js';
import { mockInputBase, mockFormLabel } from '../../Home.styles';

const SECTION_BG = '#f8f9fa';

export default function MockBookingFormMobile() {
    const count = 1;
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
            boxShadow: shadows.card,
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
                        <span data-demo-count style={{ fontWeight: fontWeight.medium, fontSize: fontSize.base }}>{count}명</span>
                        <Flex gap={6}>
                            {[
                                { Icon: MinusOutlined, disabled: count <= 1 },
                                { Icon: PlusOutlined,  disabled: false },
                            ].map((item, k) => (
                                <button className="marketing-stepper" data-demo-delta={k === 0 ? -1 : 1} disabled={item.disabled} key={k} type="button"
                                    style={{ width: 30, height: 30, borderRadius: radius.md, background: colors.gray[100], border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',   color: colors.text.secondary, transition: 'background 0.15s', flexShrink: 0 }}
                                >
                                    <item.Icon style={{ fontSize: 10 }} />
                                </button>
                            ))}
                        </Flex>
                    </div>
                </div>
                <div>
                    <label style={{ ...mockFormLabel, fontSize: 12 }}>요청 사항</label>
                    <div style={{ background: colors.gray[50], borderRadius: radius.lg, height: 54, display: 'flex', alignItems: 'flex-start', padding: '10px 14px' }}>
                        <span style={{ color: colors.text.tertiary, fontSize: 13 }}>요청 사항을 입력하세요.</span>
                    </div>
                </div>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, background: `linear-gradient(to bottom, rgba(248,249,250,0) 0%, ${SECTION_BG} 75%)`, pointerEvents: 'none' }} />
        </div>
    );
}
