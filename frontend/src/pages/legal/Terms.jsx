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

const Terms = () => {
    useDocumentTitle('서비스 이용약관');
    return (
        <PageContainer size="md" paddingTop="60px">
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={{ fontWeight: fontWeight.extrabold, color: colors.text.primary, marginBottom: 8 }}>서비스 이용약관</Title>
                <Text style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>시행일: 2026년 1월 1일 · 최종 수정: 2026년 5월 17일</Text>
            </div>

            <Section title="제1조 (목적)">
                <Paragraph>본 약관은 RESERVE(이하 "서비스")가 제공하는 식당 예약 플랫폼 서비스의 이용과 관련하여 서비스와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</Paragraph>
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

            <Section title="제4조 (결제 및 환불)">
                <Paragraph>일부 가게는 예약 시 예약금(노쇼 방지금) 결제를 요구할 수 있습니다. 결제는 외부 전자결제대행사(PG)인 주식회사 카카오페이의 결제 창을 통해 안전하게 처리되며, 서비스는 이용자의 실제 카드 정보나 계좌 정보를 서버에 저장하지 않습니다.</Paragraph>
                <Paragraph>가게 사정으로 인해 예약을 거절하거나 취소할 경우, 결제된 예약금은 카카오페이 시스템을 통해 전액 환불 처리됩니다. 환불 소요 시간은 카드사 정책에 따라 다를 수 있습니다.</Paragraph>
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
                <Paragraph>이용자는 언제든지 마이페이지를 통해 회원 탈퇴를 요청할 수 있으며, 서비스는 즉시 탈퇴를 처리합니다.</Paragraph>
                <Paragraph>탈퇴 시 이용자의 개인정보는 즉시 파기되나, 시스템 안정성 검증을 위한 감사 로그(Audit Log)는 개인정보 처리방침에 따라 90일간 분리 보관 후 파기됩니다. 이미 완료된 예약 이력은 가게 사업자의 운영을 위해 일정 기간 익명화하여 보관될 수 있습니다.</Paragraph>
            </Section>

            <Section title="제7조 (면책조항)">
                <Paragraph>서비스는 이용자와 가게 사업자 간의 예약을 중개하는 플랫폼으로, 실제 서비스 품질에 대한 책임은 가게 사업자에게 있습니다. 서비스는 천재지변, 통신 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.</Paragraph>
                <Paragraph>본 서비스는 포트폴리오 목적으로 운영되며, 실제 금전적 손해에 대한 보상은 제공되지 않습니다.</Paragraph>
            </Section>

            <Section title="제8조 (권리 귀속)">
                <Paragraph>서비스 내 모든 콘텐츠, UI, 상표 등에 대한 권리는 서비스 개발자(한재은)에게 귀속됩니다. 단, 오픈소스 라이선스(MIT, Apache 2.0 등)가 적용된 구성 요소는 각 라이선스 조건을 따릅니다.</Paragraph>
            </Section>

            <Section title="제9조 (문의)">
                <Paragraph>서비스 이용 관련 문의: reserve@reserve.it.kr</Paragraph>
            </Section>
        </PageContainer>
    );
};

export default Terms;
