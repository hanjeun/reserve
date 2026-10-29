import { PageTitle } from '../../components/common/PageTypography';
import React, { useEffect } from 'react';
import { Typography } from 'antd';
import { PageContainer } from '../../components/common';
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const { Title, Paragraph, Text } = Typography;

const Section = ({ id, title, children }) => (
    <section id={id} style={{ marginBottom: 32, scrollMarginTop: 88 }}>
        <Title level={4} style={{ fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 12 }}>{title}</Title>
        <div style={{ fontSize: fontSize.base, color: colors.text.secondary, lineHeight: 1.8 }}>{children}</div>
    </section>
);

const Terms = () => {
    useEffect(() => {
        const reveal = () => { if (window.location.hash === '#payments') document.getElementById('payments')?.scrollIntoView({ block: 'start', behavior: 'instant' }); };
        reveal();
        window.addEventListener('hashchange', reveal);
        return () => window.removeEventListener('hashchange', reveal);
    }, []);
    // 색인 대상 경로다 — 설명을 비워두면 크롤러가 본문 DOM을 긁어 만든 문장이
    // 검색 결과에 실린다(네이버에서 실제로 그렇게 나왔다).
    useDocumentTitle('서비스 이용약관', 'RESERVE 서비스 이용약관 — 회원 자격, 예약과 결제, 취소·환불, 책임 범위를 안내합니다.');
    return (
        <PageContainer size="md" paddingTop="60px">
            <div style={{ marginBottom: 40 }}>
                <PageTitle>서비스 이용약관</PageTitle>
                <Text style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>시행일: 2026년 1월 1일 · 최종 수정: 2026년 10월 27일</Text>
            </div>

            <Section title="제1조 (목적)">
                <Paragraph>본 약관은 RESERVE(이하 "서비스")가 제공하는 가게 예약 플랫폼 서비스의 이용과 관련하여 서비스와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</Paragraph>
                <Paragraph>본 서비스는 포트폴리오 목적으로 제작된 서비스로, 실제 상업적 운영이 아님을 명시합니다.</Paragraph>
            </Section>

            <Section title="제2조 (이용자의 의무)">
                <Paragraph>이용자는 다음 행위를 해서는 안 됩니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    {[
                        '허위 정보를 입력하거나 타인의 정보를 도용하는 행위',
                        '서비스의 정상적인 운영을 방해하는 행위',
                        '반복적인 허위 예약 또는 노쇼(No-Show)를 통해 가게에 피해를 주는 행위',
                        '다른 이용자에 대한 비방, 명예훼손 행위',
                        '관련 법령에 위반되는 행위',
                        '허위 사업자등록증 제출 등 부적절한 사업자 인증 신청',
                    ].map((t) => <li key={t} style={{ marginBottom: 6 }}>{t}</li>)}
                </ul>
            </Section>

            <Section title="제3조 (예약 및 취소)">
                <Paragraph>예약은 가게 정책에 따라 자동 또는 수동 승인으로 처리됩니다. 취소는 마이페이지에서 가능하며, 환불은 가게별 정책을 따릅니다.</Paragraph>
                <Paragraph>노쇼(예약 후 미방문)가 반복될 경우 서비스 이용이 제한될 수 있습니다.</Paragraph>
            </Section>

            <Section id="payments" title="제4조 (예약·결제 및 취소·환불 안내)">
                <Paragraph>가게가 예약금을 설정한 경우 결제가 필요하며, 0원인 경우 결제 없이 예약할 수 있습니다. 결제는 포트원 연동을 통해 토스페이먼츠·카카오페이 등 선택한 결제사에서 처리합니다. 서비스는 카드번호·CVC·결제 계좌 비밀번호를 입력받거나 저장하지 않습니다.</Paragraph>
                <Paragraph>결제 전 가게·예약 일시·인원·금액과 가게에서 고지한 취소·환불 기준을 확인해야 합니다. 결제 성공과 가게의 예약 승인은 구분되며, 예약 확정 여부는 내 예약에서 확인할 수 있습니다.</Paragraph>
                <Paragraph>정상 방문 환불이 적용되는 예약은 QR 체크인과 이용 완료를 확인한 뒤 보증금 전액의 환불을 요청합니다. 가게의 자동 완료 설정에 따라 이용 종료 후 처리하거나 사업자가 직접 완료 처리합니다. 기존 예약에 새 환불 정책을 일괄 적용하지 않습니다.</Paragraph>
                <Paragraph>가게가 예약을 거절하거나 가게 사정으로 취소하면 결제된 예약금의 전액 환불을 요청합니다. 이용자 취소·노쇼는 예약 시 고지된 기준과 관련 법령을 따르며, 법령상 소비자의 권리를 제한하는 조건을 우선 적용하지 않습니다. 환불 요청·확정과 실제 입금 시점은 구분하며 처리 기간은 결제 수단에 따라 달라집니다.</Paragraph>
                <Paragraph>광고의 신청 기간·금액·취소·환불 조건은 광고 신청 화면의 안내를 확인해야 합니다. TEST 가상 정산은 시험용 계산이며 실제 계좌로 지급하지 않습니다. 시험 결제의 처리 방법은 해당 결제사 화면의 안내를 따릅니다.</Paragraph>
            </Section>

            <Section title="제5조 (서비스 이용 제한 및 계정 정지)">
                <Paragraph>서비스는 이용자가 다음 각 호에 해당하는 경우, 사전 통지 후 또는 긴급한 경우 즉시 이용을 제한하거나 계정을 정지(기간제 정지 또는 영구 정지)할 수 있습니다.</Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                    {[
                        '이용약관을 위반한 경우',
                        '정당한 사유 없는 노쇼(No-Show)가 반복적으로 누적된 경우',
                        '허위 사업자 인증 신청(허위 사업자등록증 제출 등)이 적발된 경우',
                        '다른 이용자 또는 가게 사업자에게 피해를 주는 행위',
                        '관련 법령에 위반되는 행위',
                    ].map((t) => <li key={t} style={{ marginBottom: 6 }}>{t}</li>)}
                </ul>
                <Paragraph style={{ marginTop: 12 }}>기간제 정지의 경우 정지 기간이 만료되면 자동으로 이용이 재개됩니다. 영구 정지는 관리자에 의해 해제될 수 있습니다.</Paragraph>
            </Section>

            <Section title="제6조 (회원 탈퇴 및 데이터 처리)">
                <Paragraph>이용자는 마이페이지를 통해 회원 탈퇴를 요청할 수 있습니다. 다만 운영 중인 가게, 처리되지 않은 예약·환불·결제 확인 건이 있는 경우에는 이용자와 가게의 권리를 보호하기 위해 해당 처리를 마친 뒤 탈퇴할 수 있습니다.</Paragraph>
                <Paragraph>탈퇴가 완료되면 로그인 정보, 이메일, 위치, 소셜 로그인 토큰 등 계정 식별정보를 제거하고 계정을 즉시 사용할 수 없게 합니다. 예약·결제·환불·후기 및 분쟁 대응에 필요한 기록은 회원을 직접 식별할 수 없도록 치환하여 보존하며, 자유 입력 예약 요청사항과 결제 구매자 연락처는 제거합니다. 감사 로그는 90일 후 자동 파기합니다.</Paragraph>
                <Paragraph>일반 채팅의 글·사진은 전송일부터 90일 보관합니다. 처리된 일반 신고는 1년, 소비자 불만·거래 분쟁은 3년, 계약·청약철회·결제·공급 증거는 해당 거래일 기준 5년 보관하며 미처리 신고와 진행 중인 분쟁은 파기를 보류합니다. 변경된 채팅 보존기간은 실제 고지 후 30일 유예를 거쳐 기존 자료에도 적용합니다. 자세한 파기 절차와 관리자 열람 기록·웨이팅 접수의 보존기간은 개인정보 처리방침에서 확인할 수 있습니다.</Paragraph>
            </Section>

            <Section title="제7조 (서비스 역할)">
                <Paragraph>서비스는 이용자와 가게 사업자 간의 예약을 중개하는 플랫폼입니다. 방문 시 제공되는 서비스는 각 가게 사업자가 직접 운영합니다.</Paragraph>
            </Section>

            <Section title="제8조 (권리 귀속)">
                <Paragraph>서비스가 직접 제작한 UI와 콘텐츠의 권리는 서비스 개발자(한재은)에게 귀속됩니다. 이용자가 작성한 콘텐츠와 외부 사진·서체·상표의 권리는 각 권리자에게 있으며, 오픈소스 구성 요소는 해당 라이선스 조건을 따릅니다.</Paragraph>
            </Section>

            <Section title="제9조 (문의)">
                <Paragraph>서비스 이용 관련 문의: reserve@reserve.it.kr</Paragraph>
            </Section>
        </PageContainer>
    );
};

export default Terms;
