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

    // 예약 알림 ──
    const notiEnabled = typeof user?.emailNotificationEnabled === 'boolean' ? user.emailNotificationEnabled : true;
    const [notiLoading, setNotiLoading] = useState(false);

    // 마케팅 수신 ──
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

// 디자인 설정
/*
 * 모양·글꼴 설정은 기기별로 저장하며 공통 선택 도구를 사용한다.
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

            {/*
             * PC는 두 열, 모바일은 한 열로 글꼴·색 선택 너비를 정한다.
             */}
            <div style={styles.designGrid}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>글꼴</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block', marginBottom: 8 }}>
                        앱 전체에 적용돼요
                    </Text>
                    <FormSelect
                        value={font}
                        onChange={setFont}
                        /*
                         * 각 옵션을 해당 글꼴로 표시해 선택 전에 비교할 수 있게 한다.
                         */
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
                    {/*
                     * 옵션의 색 점은 현재 테마의 실제 적용색을 보여준다.
                     */}
                    <FormSelect
                        value={accent}
                        onChange={setAccent}
                        options={ACCENT_OPTIONS.map(o => ({
                            value: o.value,
                            label: (
                                // 색 점이 포함된 inline-flex의 기준선이 입력 높이를 늘리지 않도록 세로 중앙에 맞춘다.

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
