import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Checkbox } from 'antd';
import { PageContainer, Button } from '../../components/common';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, fontWeight, agreement as A } from '../../styles/tokens';

const { Title, Text } = Typography;

const SocialAgreement = () => {
    const navigate = useNavigate();
    const { message } = useMessage();
    const { logout, login, user } = useAuthStore();
    useDocumentTitle('서비스 이용 동의');

    const [agreements, setAgreements] = useState({ terms: false, privacy: false, marketing: false });
    const [loading, setLoading] = useState(false);

    const allRequired = agreements.terms && agreements.privacy;
    const allChecked  = allRequired && agreements.marketing;

    const handleAll = (checked) => setAgreements({ terms: checked, privacy: checked, marketing: checked });

    const handleSubmit = async () => {
        if (!allRequired) { message.warning('필수 항목에 동의해주세요.'); return; }
        setLoading(true);
        try {
            await api.post(API_ENDPOINTS.AUTH.AGREE_TERMS);
            // login() 액션으로 갱신 — partialize 거쳐서 localStorage도 동기화
            login({ ...user, termsAgreed: true });
            message.success('환영합니다! RESERVE를 시작해보세요.');
            navigate('/', { replace: true });
        } catch {
            message.error('오류가 발생했습니다. 다시 시도해주세요.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login', { replace: true });
    };

    return (
        <PageContainer size="sm" paddingTop="80px">
            <div style={{ maxWidth: 400, margin: '0 auto' }}>
                <Title level={2} style={styles.title}>RESERVE 서비스 이용 동의</Title>
                <Text type="secondary" style={styles.subtitle}>
                    서비스 시작을 위해 아래 약관에 동의해주세요.
                </Text>

                <div style={A.section}>
                    <div style={A.allRow} onClick={() => handleAll(!allChecked)}>
                        <Checkbox style={{ flexShrink: 0 }} checked={allChecked} onChange={e => handleAll(e.target.checked)} />
                        <Text style={A.allText}>RESERVE 서비스 이용에 모두 동의합니다</Text>
                    </div>
                    <div style={A.divider} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={A.itemRow}>
                            <div style={A.itemLeft} onClick={() => setAgreements(p => ({ ...p, terms: !p.terms }))}>
                                <Checkbox checked={agreements.terms} onChange={e => setAgreements(p => ({ ...p, terms: e.target.checked }))} />
                                <Text style={A.itemText}><span style={A.requiredTag}>필수</span> 서비스 이용약관</Text>
                            </div>
                            <button style={A.viewLink} onClick={() => window.open('/terms', '_blank')}>보기</button>
                        </div>
                        <div style={A.itemRow}>
                            <div style={A.itemLeft} onClick={() => setAgreements(p => ({ ...p, privacy: !p.privacy }))}>
                                <Checkbox checked={agreements.privacy} onChange={e => setAgreements(p => ({ ...p, privacy: e.target.checked }))} />
                                <Text style={A.itemText}><span style={A.requiredTag}>필수</span> 개인정보 처리방침</Text>
                            </div>
                            <button style={A.viewLink} onClick={() => window.open('/privacy', '_blank')}>보기</button>
                        </div>
                        <div style={A.itemRow}>
                            <div style={A.itemLeft} onClick={() => setAgreements(p => ({ ...p, marketing: !p.marketing }))}>
                                <Checkbox checked={agreements.marketing} onChange={e => setAgreements(p => ({ ...p, marketing: e.target.checked }))} />
                                <Text style={A.itemText}><span style={A.optionalTag}>선택</span> 이메일 마케팅 수신 동의</Text>
                            </div>
                        </div>
                    </div>
                </div>

                <Button
                    variant="primary" block
                    style={{ marginTop: 40 }}
                    loading={loading}
                    disabled={!allRequired}
                    onClick={handleSubmit}
                >
                    시작하기
                </Button>

                <Button
                    variant="ghost" block
                    style={{ marginTop: 12 }}
                    onClick={handleLogout}
                >
                    로그아웃
                </Button>
            </div>
        </PageContainer>
    );
};

const styles = {
    title:    { fontWeight: fontWeight.extrabold, marginBottom: 8, letterSpacing: '-1px', color: colors.text.primary },
    subtitle: { display: 'block', marginBottom: 40, color: colors.text.tertiary, fontSize: fontSize.lg },
};

export default SocialAgreement;
