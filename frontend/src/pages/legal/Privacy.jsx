import { PageTitle } from '../../components/common/PageTypography';
import React from 'react';
import { Typography } from 'antd';
import { PageContainer } from '../../components/common';
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import TextLink from '../../components/common/TextLink';
import { useQuery } from '@tanstack/react-query';
import chatRetentionService from '../../services/chatRetentionService';
import waitingService from '../../services/waitingService';
import { useFeedConfig } from '../../hooks/feedQueries';
import { useStoreNewsConfig } from '../../hooks/storeNewsQueries';
import { useFeedInteractions } from '../../hooks/feedInteractionQueries';

const { Title, Paragraph, Text } = Typography;

const RetentionDates = () => {
    const { data } = useQuery({ queryKey: ['public', 'chatRetentionPolicy'], queryFn: chatRetentionService.policy,
        staleTime: 60_000, retry: false });
    if (!data?.noticePublishedAt || !data?.effectiveAt) return null;
    if ([data.noticePublishedAt, data.effectiveAt].some((value) => Number.isNaN(new Date(value).getTime()))) return null;
    const format = (value) => new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', dateStyle: 'long', timeStyle: 'short',
    }).format(new Date(value));
    return <Paragraph>보존기간 변경 고지: {format(data.noticePublishedAt)} · 적용 시작: {format(data.effectiveAt)}</Paragraph>;
};

const WaitingNoticeDate = () => {
    const { data } = useQuery({ queryKey: ['public', 'waitingRetentionPolicy'], queryFn: waitingService.getRetentionPolicy,
        staleTime: 60_000, retry: false });
    if (!data?.noticePublishedAt || !Number.isFinite(Date.parse(data.noticePublishedAt))) return null;
    const publishedAt = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', dateStyle: 'long', timeStyle: 'short',
    }).format(new Date(data.noticePublishedAt));
    return <Paragraph>고객 웨이팅 개인정보 고지 게시: {publishedAt}</Paragraph>;
};

const Section = ({ title, children }) => (
    <div style={{ marginBottom: 32 }}>
        <Title level={4} style={{ fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 12 }}>{title}</Title>
        <div style={{ fontSize: fontSize.base, color: colors.text.secondary, lineHeight: 1.8 }}>{children}</div>
    </div>
);

const FeedPrivacy = () => {
    const { data } = useFeedConfig();
    const news = useStoreNewsConfig(true);
    const interactions = useFeedInteractions();
    if (!data?.enabled && !news.data?.enabled) return null;
    return <Section title="피드·가게 소식의 공개 정보와 보관">
        {data?.enabled && <Paragraph>피드를 이용하면 공개 닉네임·소개, 직접 공개에 동의한 프로필 사진, 게시물 글·사진과 선택한 지역·가게 연결 정보를 처리합니다. 공개 프로필과 게시물은 로그인하지 않아도 볼 수 있습니다. 계정의 이름·이메일을 공개 프로필에 자동으로 표시하지 않습니다.</Paragraph>}
        <Paragraph>게시물과 임시저장한 글은 삭제할 때까지 보관합니다. 삭제하면 공개 조회에서 즉시 숨기고, 30일 후 원문과 사진을 파기합니다. 회원 탈퇴 후에는 공개 프로필·게시물을 노출하지 않고 게시물 파기 절차를 적용합니다. 채팅의 90일 보관 기간은 피드에 적용하지 않습니다.</Paragraph>
        {interactions.data?.enabled && <Paragraph>댓글·답글의 글과 사진은 공개 닉네임으로 표시합니다. 수정할 수 있으며 삭제하면 즉시 숨기고 30일 후 원문·사진을 파기합니다. 글·소식·댓글의 좋아요는 대상별로 저장하고, 삭제되거나 숨겨진 내용은 종합 좋아요에서도 표시하지 않습니다. 댓글·답글·댓글 좋아요 알림은 수신자에게만 보여주며 생성일부터 90일 동안 보관합니다. 탈퇴하면 해당 회원이 주고받은 피드 알림을 제거합니다. 신고 당시 댓글·사진은 원문과 별도로 보존합니다.</Paragraph>}
        {news.data?.enabled && <><Paragraph>사업자의 가게 소식은 제목·본문·사진·종류·행사나 혜택의 기간·조건을 혜택의 별도 원문으로 처리합니다. 관리자가 해당 글·사진·기간·조건을 심사하고 승인 후 혜택 탭과 상세에서 공개합니다. 공개 닉네임은 필요하지 않으며 가게 이름을 표시합니다. 피드와 글·사진·게시 상태를 연결하지 않습니다. 신청·심사 사유와 처리·열람 기록을 보관합니다. 기간 종료는 삭제가 아니며 승인된 공개 상세에는 종료 표시로 남깁니다.</Paragraph>
            <Paragraph>혜택 신청의 글·사진 열람과 승인·반려·철회·수정 재심사 기록은 각 기록일부터 최소 1년(2년 보관 대상이면 2년) 보관하며, 연결된 신고 자료가 남아 있으면 함께 보존합니다. 혜택 반려·삭제는 피드 글에 영향을 주지 않으며 소식의 삭제·원문 및 사진 파기에는 같은 30일 정책을 적용합니다.</Paragraph></>}
        <Paragraph>신고 시점의 글·사진, 신고 내용과 관리자 처리 기록은 원래 게시물과 분리해 보관합니다. 처리 중인 신고 자료는 검토를 마칠 때까지, 처리 완료한 일반 신고 자료는 완료 후 365일 동안 보관합니다. 분쟁 등으로 관리자가 파기를 보류한 자료는 보류가 해제될 때까지 파기하지 않습니다. 보류를 해제하면 해제일을 기준으로 보관 기간을 다시 계산합니다. 신고 원문·사진 열람과 숨김·복원·보류·해제의 처리 기록은 각 기록일부터 최소 1년(2년 보관 대상이면 2년) 보관하며, 연결된 신고 자료가 남아 있으면 함께 보존합니다.</Paragraph>
    </Section>;
};

const Privacy = () => {
    // 색인 대상 경로다 — 위 Terms.jsx 와 같은 이유로 설명을 직접 준다.
    useDocumentTitle('개인정보 처리방침', 'RESERVE 개인정보 처리방침 — 수집하는 항목, 이용 목적, 보관 기간, 파기 절차와 이용자 권리를 안내합니다.');
    return (
        <PageContainer size="md" paddingTop="60px">
            <div style={{ marginBottom: 40 }}>
                <PageTitle>개인정보 처리방침</PageTitle>
                <Text style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>시행일: 2026년 5월 17일 · 최종 수정: 2026년 10월 27일</Text>
            </div>

            <Section title="1. 수집하는 개인정보 항목">
                <Paragraph>RESERVE는 서비스 제공을 위해 다음과 같은 정보를 수집합니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}><strong>회원가입 시:</strong> 이메일 주소, 이름, 비밀번호(일방향 해시 저장)</li>
                    <li style={{ marginBottom: 6 }}><strong>소셜 로그인 시:</strong> 이메일, 이름, 프로필 사진 (Google/Naver/Kakao 제공 정보)</li>
                    <li style={{ marginBottom: 6 }}><strong>예약 시:</strong> 예약 정보(날짜, 시간, 인원), 요청사항</li>
                    <li style={{ marginBottom: 6 }}><strong>채팅·신고 시:</strong> 대화 내용, 첨부 사진과 원래 파일명, 신고 내용·처리 기록 및 검토에 필요한 대화 증거</li>
                    <li style={{ marginBottom: 6 }}><strong>가게 소식 작성 시:</strong> 작성자와 가게 연결, 제목·본문·사진·소식 종류·기간·조건, 공개 여부와 작성·수정·삭제 시각</li>
                    <li style={{ marginBottom: 6 }}><strong>웨이팅 접수 시:</strong> 회원 식별자와 이름(고객 접수), 선택한 팀 표시명(직원 접수), 접수 방식, 인원, 접수 번호와 접수·호출·입장·취소 시각. 대기 명단에서 연락처는 수집하지 않습니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>결제 시:</strong> 포트원을 통한 결제 처리 정보입니다. 카드·계좌 정보는 RESERVE 서버에 저장하지 않습니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>추가 인증 사용 시:</strong> 패스키 공개키·식별자·사용 기록, 암호화한 인증 앱 비밀키와 일회용 복구코드의 해시를 처리합니다. 기기의 지문·얼굴 정보와 PIN은 수집하지 않습니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>자동 수집:</strong> 서비스 이용 기록, IP 주소, 접속 로그</li>
                </ul>
            </Section>

            <Section title="2. 개인정보 수집 및 이용 목적">
                <ul style={{ paddingLeft: 20 }}>
                    {['회원 가입 및 서비스 이용 관리', '예약 서비스 제공 및 예약 확인 안내', '웨이팅 접수·순서 확인·호출·입장 관리', '결제 처리 및 환불', '서비스 이용 관련 공지 및 고객 문의 응대', '서비스 개선을 위한 통계 분석'].map((t) => (
                        <li key={t} style={{ marginBottom: 6 }}>{t}</li>
                    ))}
                </ul>
            </Section>

            <Section title="3. 개인정보 보유 및 이용 기간">
                <Paragraph>처리 목적과 자료 종류에 따라 다음 기간 동안 보유합니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}>일반 감사 로그(Audit Log): 90일 보관 후 파기. 신고 자료의 열람·처리 기록은 아래의 별도 기간을 적용합니다.</li>
                    <li style={{ marginBottom: 6 }}>계정 식별정보(이메일, 비밀번호, 위치, 소셜 로그인 토큰): 탈퇴 처리 시 제거 또는 비식별 값으로 치환</li>
                    <li style={{ marginBottom: 6 }}>일반 채팅의 글·사진·원래 파일명: 전송일로부터 90일. 만료되면 원문과 사진 참조를 제거하고 사진 파일을 파기합니다.</li>
                    <li style={{ marginBottom: 6 }}>처리된 일반 채팅 신고·증거: 처리 완료일로부터 1년</li>
                    <li style={{ marginBottom: 6 }}>소비자 불만·거래 분쟁 처리 기록: 처리 완료일로부터 3년</li>
                    <li style={{ marginBottom: 6 }}>계약·청약철회·대금결제·재화 공급 기록: 해당 거래일을 기준으로 5년. 관련 채팅 증거는 일반 채팅과 구분하여 보관합니다.</li>
                    <li style={{ marginBottom: 6 }}>관리자의 신고 원문·사진 열람 기록: 각 열람일부터 1년 이상. 법령상 2년 보관 대상이면 2년 이상 보관합니다.</li>
                    <li style={{ marginBottom: 6 }}>웨이팅: 입장·취소가 끝난 팀의 표시명과 회원 연결은 다음 한국 시간 날짜에 제거하고, 접수 방식·인원·번호·처리 시각과 고객이 동의한 고지 버전 등 종료 접수 기록은 7일 후 파기합니다. 진행 중인 접수는 처리할 때까지 보관합니다. 회원 탈퇴 시 해당 회원의 진행 접수를 취소하고 이름과 회원 연결을 제거하며, 가게가 삭제되면 남은 접수를 취소하고 표시명과 회원 연결을 제거합니다.</li>
                    <li style={{ marginBottom: 6 }}>가게 소식과 임시저장한 소식: 삭제할 때까지 보관합니다. 작성자 삭제·가게 폐업·회원 탈퇴 시 혜택과 연결된 피드에서 즉시 숨기고 30일 후 원문·사진을 파기합니다. 신고 당시 원문·사진은 별도 보관하며 처리 중에는 유지하고, 처리 완료 후 365일 또는 파기 보류가 해제된 날부터 365일 동안 보관합니다.</li>
                    <li style={{ marginBottom: 6 }}>예약 자유 입력 요청사항 및 결제 구매자 이름·이메일·전화번호: 탈퇴 처리 시 제거 또는 비식별화</li>
                    <li style={{ marginBottom: 6 }}>법령에 따라 보존이 필요한 경우 해당 기간 동안 별도 보관</li>
                </ul>
                <Paragraph>미처리·미분류 신고, 진행 중인 분쟁·조사와 미결 거래 자료는 파기를 보류합니다. 법정 보존 자료는 일반 이용 자료와 분리하여 접근을 제한합니다. 채팅·신고의 보존기간 변경은 실제 서비스 고지 게시일부터 30일 유예 후 기존 자료에도 적용하며, 유예 중에는 이미 기간이 지난 자료도 자동 파기하지 않습니다.</Paragraph>
                <RetentionDates />
                <WaitingNoticeDate />
            </Section>

            <FeedPrivacy />

            <Section title="4. 개인정보 파기 절차 및 방법">
                <Paragraph><strong>파기 절차:</strong> 탈퇴 전 운영 중인 가게와 미결 예약·환불·결제 상태를 확인합니다. 처리가 완료되면 계정 식별정보를 같은 트랜잭션에서 비식별화하고, 보존 목적이 없는 개인화·커뮤니티 데이터는 삭제합니다.</Paragraph>
                <Paragraph><strong>파기 방법:</strong> 전자적 정보는 DB 삭제 또는 비식별 값 치환으로 처리합니다. S3의 프로필 사진·사업자등록증·폐업 가게 이미지·만료 채팅 사진·삭제된 피드와 가게 소식 사진은 DB에 삭제 작업을 먼저 기록한 뒤 별도 작업자가 삭제하며, 일시적인 AWS 오류가 발생하면 완료될 때까지 재시도합니다. 신고 증거가 보존 중인 사진은 그 보존이 끝나고 다른 대화·게시물·신고 참조가 없을 때 삭제합니다.</Paragraph>
            </Section>

            <Section title="5. 개인정보의 안전성 확보 조치">
                <Paragraph>RESERVE는 이용자의 개인정보를 안전하게 보호하기 위해 다음과 같은 기술적 조치를 취하고 있습니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    <li style={{ marginBottom: 6 }}><strong>암호화:</strong> 비밀번호는 BCrypt 일방향 해시로 저장하며, 평문으로 저장하지 않습니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>통신 암호화:</strong> 모든 데이터 통신은 SSL/TLS(HTTPS)를 통해 암호화됩니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>인증 토큰:</strong> JWT 기반 인증을 사용하며 HttpOnly 쿠키로 저장하여 XSS 공격을 방어합니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>접근 제어:</strong> 역할 기반 접근 제어(RBAC)를 적용하여 불필요한 데이터 접근을 차단합니다.</li>
                    <li style={{ marginBottom: 6 }}><strong>인프라:</strong> AWS Lightsail 클라우드 환경에서 운영되며 방화벽 및 포트 최소화 정책을 적용합니다.</li>
                </ul>
            </Section>

            <Section title="6. 개인정보의 제3자 제공">
                <Paragraph>고객 웨이팅을 접수하면 이용자가 선택한 가게의 운영자에게 회원 이름, 인원, 접수 번호·상태와 처리 시각을 제공합니다. 접수·호출·입장 관리에 사용하며, 연락처와 회원 식별자는 명단에 표시하지 않습니다. 진행 접수는 처리할 때까지 보관하고, 종료 팀 이름은 다음 한국 시간 날짜에 제거하며 종료 기록은 7일 후 파기합니다. 접수 화면에서 제공 동의를 받으며, 동의하지 않으면 앱에서 고객 웨이팅을 접수할 수 없습니다.</Paragraph>
                <Paragraph>예약을 접수하면 선택한 가게 운영자에게 예약자 이름, 예약 일시·인원·요청사항과 예약·결제 상태를 예약 접수·이용 관리를 위해 제공합니다. 일반 공개 화면에는 예약자의 개인정보를 표시하지 않습니다.</Paragraph>
                <Paragraph>위 예약·고객 웨이팅 제공과 다음 경우를 제외하고 이용자의 개인정보를 외부에 제공하지 않습니다.</Paragraph>
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
                            ['포트원', '결제 연동 및 결과 확인'],
                            ['토스페이먼츠', '선택한 카드·간편결제 처리'],
                            ['주식회사 카카오페이', '선택한 간편결제 처리'],
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
                        <span style={{ color: colors.text.tertiary }}>국번없이 <TextLink href="tel:118" style={{ color: colors.primary.main }}>118</TextLink> ·{' '}<TextLink href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer">privacy.kisa.or.kr</TextLink></span>
                    </li>
                    <li style={{ marginBottom: 8 }}>
                        <strong>개인정보분쟁조정위원회</strong><br />
                        <span style={{ color: colors.text.tertiary }}>국번없이 <TextLink href="tel:1833-6972" style={{ color: colors.primary.main }}>1833-6972</TextLink> ·{' '}<TextLink href="https://www.koprc.go.kr" target="_blank" rel="noopener noreferrer">koprc.go.kr</TextLink></span>
                    </li>
                    <li style={{ marginBottom: 8 }}>
                        <strong>대검찰청 사이버범죄수사단</strong><br />
                        <span style={{ color: colors.text.tertiary }}><TextLink href="tel:02-3480-3573" style={{ color: colors.primary.main }}>02-3480-3573</TextLink> ·{' '}<TextLink href="https://www.spo.go.kr" target="_blank" rel="noopener noreferrer">spo.go.kr</TextLink></span>
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
