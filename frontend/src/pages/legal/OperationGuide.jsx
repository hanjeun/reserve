import React from 'react';
import { Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { PageContainer } from '../../components/common';
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const { Title, Paragraph, Text } = Typography;

const sectionStyle = { marginBottom: 32 };
const linkStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
};

const Section = ({ title, children }) => (
    <section style={sectionStyle}>
        <Title level={4} style={{ fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 12 }}>{title}</Title>
        <div style={{ fontSize: fontSize.base, color: colors.text.secondary, lineHeight: 1.8 }}>{children}</div>
    </section>
);

const OperationGuide = () => {
    useDocumentTitle('운영 안내', 'RESERVE에서 가게를 탐색하고 예약을 확인하거나 가게를 운영하는 기본 흐름을 안내합니다.');

    return (
        <PageContainer size="md" paddingTop="60px">
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={{ fontWeight: fontWeight.extrabold, color: colors.text.primary, marginBottom: 8 }}>운영 안내</Title>
                <Text style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>최종 수정: 2026년 9월 20일</Text>
            </div>

            <Section title="예약 이용">
                <Paragraph>
                    가게 탐색에서 서비스 분야와 지역을 고른 뒤, 가게 상세 화면에서 가능한 날짜와 시간을 확인해 예약할 수 있습니다.
                    예약 요청의 처리 결과와 내역은 내 예약에서 확인합니다.
                </Paragraph>
                <Link to="/stores" style={linkStyle}>가게 탐색하기 <ArrowRightOutlined aria-hidden="true" /></Link>
                <br />
                <Link to="/my-reservations" style={linkStyle}>내 예약 확인하기 <ArrowRightOutlined aria-hidden="true" /></Link>
            </Section>

            <Section title="가게 운영">
                <Paragraph>
                    사업자 계정은 가게를 등록한 뒤 예약 관리에서 예약을 확인하고 처리합니다. 가게 등록과 수정에 필요한 항목은
                    화면의 안내에 따라 입력하며, 운영 중인 가게와 미결 처리 항목이 있으면 계정 변경·탈퇴 전에 먼저 확인해야 합니다.
                </Paragraph>
                <Link to="/my-stores" style={linkStyle}>내 가게 관리하기 <ArrowRightOutlined aria-hidden="true" /></Link>
                <br />
                <Link to="/business" style={linkStyle}>예약 관리 열기 <ArrowRightOutlined aria-hidden="true" /></Link>
            </Section>

            <Section title="광고 노출">
                <Paragraph>
                    사업자 파트너 패널의 광고 관리에서 가게별 노출형·배너형 광고를 신청하고 노출 기간을 관리할 수 있습니다.
                    광고 노출·결제·취소 조건은 신청 화면에 표시되는 현재 안내를 기준으로 확인합니다.
                </Paragraph>
                <Link to="/business?tab=ads" style={linkStyle}>광고 관리 열기 <ArrowRightOutlined aria-hidden="true" /></Link>
            </Section>

            <Section title="조회가 되지 않을 때">
                <Paragraph>
                    목록이나 일정이 보이지 않으면 회색 안내 영역의 다시 불러오기를 선택해 같은 조회를 다시 요청할 수 있습니다.
                    인터넷 연결, 로그인 계정, 권한을 확인한 뒤에도 계속되면 문의하기로 알려주세요.
                </Paragraph>
            </Section>

            <Section title="정책과 권리 안내">
                <Paragraph>
                    예약·결제·취소의 기준은 서비스 이용약관을, 개인정보 처리 기준은 개인정보 처리방침을 따릅니다.
                    화면에 쓰는 외부 사진과 상표·라이선스 정보는 콘텐츠 출처·권리 안내에서 확인할 수 있습니다.
                </Paragraph>
                <Link to="/terms" style={linkStyle}>서비스 이용약관 <ArrowRightOutlined aria-hidden="true" /></Link>
                <br />
                <Link to="/privacy" style={linkStyle}>개인정보 처리방침 <ArrowRightOutlined aria-hidden="true" /></Link>
                <br />
                <Link to="/content-sources" style={linkStyle}>콘텐츠 출처·권리 안내 <ArrowRightOutlined aria-hidden="true" /></Link>
            </Section>
        </PageContainer>
    );
};

export default OperationGuide;
