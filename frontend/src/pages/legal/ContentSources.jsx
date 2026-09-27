import React, { useMemo } from 'react';
import { Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { PageContainer } from '../../components/common';
import { formatRegionLabel } from '../../constants/regions';
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { tourismService } from '../../services';
import { tourismKeys } from '../../hooks/queryKeys';

const { Title, Paragraph, Text } = Typography;

const Section = ({ id, title, children }) => (
    <section id={id} style={{ marginBottom: 32, scrollMarginTop: 88 }}>
        <Title level={4} style={{ fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 12 }}>{title}</Title>
        <div style={{ fontSize: fontSize.base, color: colors.text.secondary, lineHeight: 1.8 }}>{children}</div>
    </section>
);

const tableCellStyle = { padding: '12px 14px', verticalAlign: 'top', borderBottom: `1px solid ${colors.border.light}` };
const tableHeaderStyle = {
    ...tableCellStyle,
    color: colors.text.primary,
    background: colors.background.subtle,
    borderBottom: `1px solid ${colors.border.default}`,
    fontWeight: fontWeight.semibold,
    whiteSpace: 'nowrap',
};

const ContentSources = () => {
    useDocumentTitle('콘텐츠 출처·권리 안내');
    const { data: dynamicPhotos = [] } = useQuery({
        queryKey: tourismKeys.catalog(),
        queryFn: tourismService.getRegionPhotoCatalog,
        staleTime: 1000 * 60 * 60 * 24,
        retry: false,
    });
    const photoAttributions = useMemo(() => (
        (Array.isArray(dynamicPhotos) ? dynamicPhotos : []).map(photo => ({
            ...photo,
            recordDate: photo.checkedAt
                ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(photo.checkedAt))
                : '확인일 미상',
        }))
    ), [dynamicPhotos]);

    return (
        <PageContainer size="md" paddingTop="60px">
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={{ fontWeight: fontWeight.extrabold, color: colors.text.primary, marginBottom: 8 }}>
                    콘텐츠 출처·권리 안내
                </Title>
                <Text style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>최종 수정: 2026년 9월 21일</Text>
            </div>

            <Section title="안내">
                <Paragraph>
                    이 페이지는 RESERVE 화면에서 직접 사용하는 외부 사진, 서체, 서비스명·표시의 출처와 이용 조건을 안내합니다.
                    이용 조건이나 출처가 확인되지 않은 자산은 등록하지 않습니다.
                </Paragraph>
            </Section>

            <Section id="region-photos" title="지역 대표 사진">
                <Paragraph>
                    지역 선택 화면의 대표 사진은 제공기관, 저작물명, 이용 유형을 확인한 자산만 사용합니다.
                    관광정보 API 사진은 서버가 공공누리 제1유형을 확인한 뒤 같은 화면에서 중앙 기준으로 표시합니다.
                    조건을 확인할 수 없거나 사진을 불러오지 못하면 지역 핀 아이콘으로 대체합니다.
                </Paragraph>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: `1px solid ${colors.border.light}`, borderRadius: 12 }}>
                    <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: fontSize.sm }}>
                        <thead>
                            <tr>
                                <th scope="col" style={tableHeaderStyle}>표시 지역</th>
                                <th scope="col" style={tableHeaderStyle}>제공기관</th>
                                <th scope="col" style={tableHeaderStyle}>저작물</th>
                                <th scope="col" style={tableHeaderStyle}>촬영연도·확인일</th>
                                <th scope="col" style={tableHeaderStyle}>이용 조건</th>
                            </tr>
                        </thead>
                        <tbody>
                            {photoAttributions.map((photo) => (
                                <tr key={`${photo.region}-${photo.sourceUrl}-${photo.contentId ?? photo.workTitle}`}>
                                    <td style={tableCellStyle}>{formatRegionLabel(photo.region)}</td>
                                    <td style={tableCellStyle}>{photo.provider}</td>
                                    <td style={tableCellStyle}>
                                        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary.main }}>
                                            {photo.workTitle}{photo.contentId ? ` (콘텐츠 ID ${photo.contentId})` : ''}
                                        </a>
                                    </td>
                                    <td style={tableCellStyle}>{photo.recordDate}</td>
                                    <td style={tableCellStyle}>{photo.license}</td>
                                </tr>
                            ))}
                            {photoAttributions.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ ...tableCellStyle, textAlign: 'center', color: colors.text.tertiary }}>
                                        아직 확인된 지역 대표 사진이 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section title="RESERVE 자체 제작 시각 자산">
                <Paragraph>
                    홈 탐색의 분야 아이콘, 탐색 배너, 서비스 로고·R 마크와 공유용 이미지는 RESERVE가 제작하거나 편집한 서비스 자산입니다.
                    이 이미지는 실제 입점 가게, 판매 상품 또는 행사 사진임을 뜻하지 않습니다.
                </Paragraph>
            </Section>

            <Section title="외부 서비스명과 상표">
                <Paragraph>
                    GitHub, Velog, Amazon Web Services, Kakao 및 KakaoPay 관련 명칭과 표지는 각 권리자에게 귀속될 수 있습니다.
                    RESERVE는 화면에서 서비스와 연동 대상을 식별하는 범위에서만 이를 표시하며, 제휴나 보증을 뜻하지 않습니다.
                </Paragraph>
            </Section>

            <Section title="서체와 오픈소스">
                <Paragraph>
                    서비스에는 Pretendard와 SUITE 서체를 사용하며, 두 서체는 SIL Open Font License 1.1 조건에 따라 제공합니다.
                    프런트엔드와 백엔드의 오픈소스 구성 요소 및 라이선스 요약은 아래 공개 고지에서 확인할 수 있습니다.
                </Paragraph>
                <a
                    href="https://github.com/hanjeun/reserve/blob/dev/THIRD_PARTY_NOTICES.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: colors.primary.main }}
                >
                    서드파티 라이선스 고지 보기
                </a>
            </Section>

            <Section title="정정·권리 문의">
                <Paragraph>
                    출처 표기, 이용 조건 또는 권리 관련 내용의 정정이 필요하면 권리 근거와 함께 reserve@reserve.it.kr로 알려주세요.
                </Paragraph>
            </Section>
        </PageContainer>
    );
};

export default ContentSources;
