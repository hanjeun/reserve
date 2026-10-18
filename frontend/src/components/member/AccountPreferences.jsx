import { useState } from 'react';
import { Typography, Switch } from 'antd';
import { DesktopOutlined, SunOutlined, MoonOutlined } from '../../components/common/icons';
import { SegmentedControl, FormSelect } from '../../components/common';
import useTheme, { FONT_OPTIONS, ACCENT_OPTIONS } from '../../hooks/useTheme';
import useStoreDraftPreferences from '../../hooks/useStoreDraftPreferences';
import { useMessage } from '../../hooks';
import { memberService } from '../../services';
import { handleApiError } from '../../utils/errorHandler';
import useAuthStore from '../../store/useAuthStore';
import { colors, fontSize } from '../../styles/tokens';

import styles from './myPageStyles';

const { Text } = Typography;
const NotificationSection = ({ user }) => {
    const { message } = useMessage();
    const sessionRevision = useAuthStore(state => state.sessionRevision);

    // ── 예약 알림 ──
    const notiEnabled = typeof user?.emailNotificationEnabled === 'boolean' ? user.emailNotificationEnabled : true;
    const [notiLoading, setNotiLoading] = useState(false);

    // ── 마케팅 수신 ──
    const marketingAgreed = user?.marketingAgreed ?? false;
    const [marketingLoading, setMarketingLoading] = useState(false);

    const handleNotiToggle = async (checked) => {
        setNotiLoading(true);
        try {
            await memberService.updateMember({ emailNotificationEnabled: checked });
            const auth = useAuthStore.getState();
            if (auth.sessionRevision !== sessionRevision || auth.user?.id !== user?.id || auth.user?.role !== user?.role) return;
            auth.updateUser({ ...auth.user, emailNotificationEnabled: checked });
            message.success(checked ? '메일 알림에 동의했어요' : '메일 알림 동의를 철회했어요');
        } catch (err) {
            handleApiError(err, message, '설정 변경에 실패했어요');
        } finally {
            setNotiLoading(false);
        }
    };

    const handleMarketingToggle = async (checked) => {
        setMarketingLoading(true);
        try {
            await memberService.updateMarketingConsent(checked);
            const auth = useAuthStore.getState();
            if (auth.sessionRevision !== sessionRevision || auth.user?.id !== user?.id || auth.user?.role !== user?.role) return;
            auth.updateUser({ ...auth.user, marketingAgreed: checked });
            message.success(checked ? '마케팅 수신에 동의했어요' : '마케팅 수신 동의를 철회했어요');
        } catch (err) {
            handleApiError(err, message, '설정 변경에 실패했어요');
        } finally {
            setMarketingLoading(false);
        }
    };

    return (
        <div style={styles.notificationSection}>
            <Text strong style={styles.sectionTitle}>알림 설정</Text>

            {/* 예약 알림 */}
            <div style={styles.notifRow}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>예약 알림 메일</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>예약 승인/거절 시 이메일로 알림 받기</Text>
                </div>
                <Switch size="small" checked={notiEnabled} loading={notiLoading} onChange={handleNotiToggle} />
            </div>

            {/* 구분선 */}
            <div style={{ borderTop: `1px solid ${colors.border.light}`, margin: '4px 0' }} />

            {/* 마케팅 수신 */}
            <div style={styles.notifRow}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>이메일 마케팅 수신</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>프로모션·신기능 안내 메일 받기 (선택 동의)</Text>
                </div>
                <Switch size="small" checked={marketingAgreed} loading={marketingLoading} onChange={handleMarketingToggle} />
            </div>
        </div>
    );
};

const StoreDraftSection = ({ user }) => {
    const { autoSaveEnabled, setAutoSaveEnabled } = useStoreDraftPreferences(user);
    return (
        <div style={styles.notificationSection}>
            <Text strong style={styles.sectionTitle}>가게 작성 설정</Text>
            <div style={styles.notifRow}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>자동 임시저장</Text>
                </div>
                <Switch size="small" aria-label="가게 자동 임시저장" checked={autoSaveEnabled} onChange={setAutoSaveEnabled} />
            </div>
        </div>
    );
};

// ─── 디자인 설정 ─────────────────────────────────────────────────────────────
/**
 * 화면 모양(시스템/라이트/다크)과 글꼴을 고르는 섹션.
 *
 * 컨트롤은 새로 만들지 않고 기존 디자인 시스템을 그대로 쓴다 —
 * 모양은 SegmentedControl(탭처럼 고르는 형태), 글꼴은 FormSelect(∨ 드롭다운).
 * 토글(Switch)을 안 쓴 이유: 모양은 3지선다라 on/off로 표현할 수 없고,
 * 나중에 언어 옵션이 붙어도 같은 두 컨트롤로 확장된다.
 *
 * 설정은 localStorage에 저장된다(기기별). 서버 동기화가 필요해지면
 * Member 컬럼을 추가해 /api/member/me 응답에 실어 보내면 추가 요청 없이 확장된다.
 */
const AppearanceSection = () => {
    const { theme, setTheme, font, setFont, accent, setAccent, resolvedTheme } = useTheme();

    return (
        <div style={styles.notificationSection}>
            <Text strong style={styles.sectionTitle}>디자인</Text>

            <div style={styles.designRow}>
                <div style={styles.designLabel}>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>모양</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                        시스템을 고르면 기기 설정을 따라가요
                    </Text>
                </div>
                <SegmentedControl
                    block={false}
                    value={theme}
                    onChange={setTheme}
                    options={[
                        { value: 'system', label: <span><DesktopOutlined /> 시스템</span> },
                        { value: 'light',  label: <span><SunOutlined /> 라이트</span> },
                        { value: 'dark',   label: <span><MoonOutlined /> 다크</span> },
                    ]}
                />
            </div>

            <div style={{ borderTop: `1px solid ${colors.border.light}`, margin: '4px 0' }} />

            {/* ★ 글꼴·포인트 색을 한 줄에 2개로 놓는다.
                예전에는 글꼴 셀렉트 하나가 남는 폭을 전부 차지해서 "얇고 긴 띠"처럼 보였다.
                FormSelect 는 width:100% 라 부모 칸이 폭을 정한다 — 2열 그리드로 칸을 반씩 나누면
                가게 등록 폼(항목이 2열로 놓인 화면)과 같은 비율이 된다.
                모바일(1열)에서는 원래대로 100%가 되는 게 맞다 — 좁은 화면에서 반칸은 너무 좁다. */}
            <div style={styles.designGrid}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>글꼴</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block', marginBottom: 8 }}>
                        앱 전체에 적용돼요
                    </Text>
                    <FormSelect
                        value={font}
                        onChange={setFont}
                        /* ★ 각 옵션을 **그 글꼴로** 보여준다.
                           예전에는 라벨이 전부 현재 적용된 글꼴로 렌더돼서, 고르기 전에
                           어떤 모양인지 알 수 없었다(글꼴 선택기가 미리보기를 못 하는 셈).
                           fontFamily 를 옵션마다 인라인으로 주면 목록에서 바로 비교된다. */
                        options={FONT_OPTIONS.map(o => ({
                            value: o.value,
                            label: <span style={{ fontFamily: o.stack }}>{o.label}</span>,
                        }))}
                    />
                </div>

                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>포인트 색</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block', marginBottom: 8 }}>
                        버튼·강조 표시에 쓰여요
                    </Text>
                    {/* 색은 이름만으로는 고르기 어렵다 — 옵션마다 실제 색 점을 함께 보여준다.
                        점 색은 지금 테마(라이트/다크)에 맞는 값이어야 실제 적용 결과와 일치한다. */}
                    <FormSelect
                        value={accent}
                        onChange={setAccent}
                        options={ACCENT_OPTIONS.map(o => ({
                            value: o.value,
                            label: (
                                // ★ verticalAlign: middle 이 필요하다 — inline-flex 박스의 baseline 은
                                // 첫 flex 항목의 baseline 인데, 그 항목이 글자 없는 색 점이라 baseline 이
                                // 박스 아래끝이 된다. 그러면 줄상자가 늘어나 이 셀렉트만 1px 높아진다
                                // (실측: 글꼴 54.1px vs 포인트색 55.1px). middle 이면 그 영향이 사라진다.
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, verticalAlign: 'middle' }}>
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                                            background: (resolvedTheme === 'dark' ? o.darkMode : o.light).main,
                                        }}
                                    />
                                    {o.label}
                                </span>
                            ),
                        }))}
                    />
                </div>
            </div>
        </div>
    );
};

export { NotificationSection, StoreDraftSection, AppearanceSection };
