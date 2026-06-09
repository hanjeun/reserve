import React from 'react';
import { Typography } from 'antd';
import { PageContainer } from '../../components/common';
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const { Title, Paragraph, Text } = Typography;

const Section = ({ title, children }) => (
    <div style={{ marginBottom: 32 }}>
        <Title level={4} style={{ fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 12 }}>{title}</Title>
        <div style={{ fontSize: fontSize.base, color: colors.text.secondary, lineHeight: 1.8 }}>{children}</div>
    </div>
);

const Privacy = () => {
    useDocumentTitle('개인정보 처리방침');
    return (
        <PageContainer size="md" paddingTop="60px">
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={{ fontWeight: fontWeight.extrabold, color: colors.text.primary, marginBottom: 8 }}>개인정보 처리방침</Title>
                <Text style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>시행일: 2026년 1월 1일 · 최종 수정: 2026년 5월 17일</Text>
            </div>

            <Section title="1. 수집하는 개인정보 항목">
                <Paragraph>RESERVE는 서비스 제공을 위해 다음과 같은 정보를 수집합니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}><strong>회원가입 시:</strong> 이메일 주소, 이름, 비밀번호(암호화 저장)</li>
                    <li style={{ marginBottom: 6 }}><strong>소셜 로그인 시:</strong> 이메일, 이름, 프로필 사진 (Google/Naver/Kakao 제공 정보)</li>
                    <li style={{ marginBottom: 6 }}><strong>예약 시:</strong> 예약 정보(날짜, 시간, 인원), 요청사항</li>
                    <li style={{ marginBottom: 6 }}><strong>결제 시:</strong> 결제 수단 정보 (카카오페이 처리, 카드·계좌 정보는 서버에 저장하지 않음)</li>
                    <li style={{ marginBottom: 6 }}><strong>자동 수집:</strong> 서비스 이용 기록, IP 주소, 접속 로그</li>
                </ul>
            </Section>

            <Section title="2. 개인정보 수집 및 이용 목적">
                <ul style={{ paddingLeft: 20 }}>
                    {['회원 가입 및 서비스 이용 관리', '예약 서비스 제공 및 예약 확인 안내', '결제 처리 및 환불', '서비스 이용 관련 공지 및 고객 문의 응대', '서비스 개선을 위한 통계 분석'].map((t) => (
                        <li key={t} style={{ marginBottom: 6 }}>{t}</li>
                    ))}
                </ul>
            </Section>

            <Section title="3. 개인정보 보유 및 이용 기간">
                <Paragraph>회원 탈퇴 또는 서비스 종료 시까지 보유합니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}>감사 로그(Audit Log): 90일 보관 후 파기</li>
                    <li style={{ marginBottom: 6 }}>예약 정보: 탈퇴 시 즉시 파기</li>
                    <li style={{ marginBottom: 6 }}>법령에 따라 보존이 필요한 경우 해당 기간 동안 별도 보관</li>
                </ul>
            </Section>

            <Section title="4. 개인정보 파기 절차 및 방법">
                <Paragraph><strong>파기 절차:</strong> 이용자가 입력한 정보는 목적 달성 후 내부 정책에 따라 일정 기간 보관 후 즉시 파기됩니다. 법령에 의해 보존이 필요한 정보는 별도 DB에 분리 보관됩니다.</Paragraph>
                <Paragraph><strong>파기 방법:</strong> 전자적 파일 형태의 정보는 복구 및 재생이 불가능한 기술적 방법(DB DELETE, 스토리지 영구 삭제 등)을 사용하여 파기합니다. S3에 저장된 이미지 파일(프로필 사진, 사업자등록증 등)은 탈퇴 또는 삭제 요청 시 즉시 영구 삭제됩니다.</Paragraph>
            </Section>

            <Section title="5. 개인정보의 안전성 확보 조치">
                <Paragraph>RESERVE는 이용자의 개인정보를 안전하게 보호하기 위해 다음과 같은 기술적 조치를 취하고 있습니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}><strong>암호화:</strong> 비밀번호는 BCrypt 알고리즘으로 암호화하여 저장하며, 평문으로 저장하지 않습니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>통신 암호화:</strong> 모든 데이터 통신은 SSL/TLS(HTTPS)를 통해 암호화됩니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>인증 토큰:</strong> JWT 기반 인증을 사용하며 HttpOnly 쿠키로 저장하여 XSS 공격을 방어합니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>접근 제어:</strong> 역할 기반 접근 제어(RBAC)를 적용하여 불필요한 데이터 접근을 차단합니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>인프라:</strong> AWS Lightsail 클라우드 환경에서 운영되며 방화벽 및 포트 최소화 정책을 적용합니다.</li>
                </ul>
            </Section>

            <Section title="6. 개인정보의 제3자 제공">
                <Paragraph>RESERVE는 이용자의 개인정보를 외부에 제공하지 않습니다. 단, 다음의 경우는 예외입니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}>이용자가 사전에 동의한 경우</li>
                    <li style={{ marginBottom: 6 }}>법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차에 따른 수사기관 요구 시</li>
                </ul>
            </Section>

            <Section title="7. 개인정보 처리 위탁">
                <Paragraph>RESERVE는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁하고 있습니다.</Paragraph>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.sm, marginTop: 8 }}>
                    <thead>
                        <tr style={{ background: colors.background.subtle }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', borderBottom: `1px solid ${colors.border.default}`, fontWeight: fontWeight.semibold }}>수탁자</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', borderBottom: `1px solid ${colors.border.default}`, fontWeight: fontWeight.semibold }}>위탁 업무 내용</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ['AWS (Amazon Web Services)', '서버 인프라 운영 및 데이터 저장 (Lightsail, S3)'],
                            ['주식회사 카카오페이', '결제 처리 및 인증'],
                        ].map(([company, task]) => (
                            <tr key={company} style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                                <td style={{ padding: '10px 14px', color: colors.text.primary }}>{company}</td>
                                <td style={{ padding: '10px 14px', color: colors.text.secondary }}>{task}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            <Section title="8. 쿠키 및 세션">
                <Paragraph>서비스는 로그인 상태 유지를 위해 HttpOnly 쿠키를 사용합니다. 쿠키는 브라우저에서 삭제할 수 있으나, 삭제 시 로그인이 유지되지 않을 수 있습니다.</Paragraph>
            </Section>

            <Section title="9. 이용자의 권리">
                <Paragraph>이용자는 언제든지 자신의 개인정보 조회, 수정, 삭제, 처리 정지를 요청할 수 있습니다. 마이페이지에서 직접 수정하거나 아래 연락처로 요청하실 수 있습니다. 요청은 10일 이내 처리됩니다.</Paragraph>
            </Section>

            <Section title="10. 개인정보 보호책임자">
                <Paragraph>
                    이름: 한재은<br />
                    이메일: hanjeun111@gmail.com<br />
                    서비스 문의: reserve@reserve.it.kr<br />
                    서비스: reserve.it.kr
                </Paragraph>
            </Section>

            <Section title="11. 권익침해 구제방법">
                <Paragraph>개인정보 침해로 인한 신고 또는 상담이 필요하신 경우 아래 기관에 문의하실 수 있습니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    <li style={{ marginBottom: 8 }}>
                        <strong>개인정보침해신고센터</strong><br />
                        <span style={{ color: colors.text.tertiary }}>국번없이 118 ·{' '}<a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary.main }}>privacy.kisa.or.kr</a></span>
                    </li>
                    <li style={{ marginBottom: 8 }}>
                        <strong>개인정보분쟁조정위원회</strong><br />
                        <span style={{ color: colors.text.tertiary }}>국번없이 1833-6972 ·{' '}<a href="https://www.koprc.go.kr" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary.main }}>koprc.go.kr</a></span>
                    </li>
                    <li style={{ marginBottom: 8 }}>
                        <strong>대검찰청 사이버범죄수사단</strong><br />
                        <span style={{ color: colors.text.tertiary }}>02-3480-3573 ·{' '}<a href="https://www.spo.go.kr" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary.main }}>spo.go.kr</a></span>
                    </li>
                </ul>
            </Section>

            <Section title="12. 처리방침 변경">
                <Paragraph>본 방침은 2026년 5월 17일부터 적용됩니다. 변경 시 서비스 내 공지를 통해 안내드립니다.</Paragraph>
            </Section>
        </PageContainer>
    );
};

export default Privacy;
