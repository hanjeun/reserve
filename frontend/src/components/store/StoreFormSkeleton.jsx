import PropTypes from 'prop-types';
import { Typography } from 'antd';
import Bone from '../common/Bone';
import PageContainer from '../common/PageContainer';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { MAX_IMAGE_REQUEST_MB } from '../../utils/imageUploadPolicy';
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import { STORE_FORM_COPY, STORE_FORM_DENSITY_VARS, storeFormFrame } from './storeFormFrame';
import { STORE_FORM_SKELETON_HINTS, STORE_FORM_SKELETON_TOGGLES } from './storeFormSkeletonCopy';

const { Title, Text } = Typography;

// 2026-09-29 재작성 — 실제 폼(StoreForm/StoreBasicInfo/StoreImages/StoreFormActions)과 같은 순서·배치로 그린다.
// 예전 뼈대는 라벨 14px + 간격 10px 로 칸마다 24px(데스크톱 라벨 상자는 40 + 8), 안내 문구 줄,
// '우리동네 배지'·'정기 휴무'·'운영 기간'·환불 3칸이 통째로 빠져 있어 로딩이 끝나면 폼 끝이 약 900px 아래로 늘어났다.
// 라벨·안내 문구는 서버 데이터가 아닌 고정 문구라 실제 글자로 둔다(StoreDetailSkeleton 의 라벨과 같은 원칙) —
// 그래야 폭에 따라 한 줄/두 줄로 접히는 것까지 실제 폼과 같다. 입력칸·버튼만 뼈대다.
// 문구는 storeFormSkeletonCopy.js 에 있다. 예약 방식별로 달라지는 칸(회차 시각 등)은 로딩 시점에 알 수 없어 기본값(SLOT) 배치를 따른다.
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const hintStyle = { fontSize: fontSize.xs, color: colors.text.tertiary };

// AntD Form.Item(vertical, large) 한 칸 — 라벨 상자 + 입력 자리 + 안내 문구. 크기는 store-form-layout.css 의 뼈대 규칙이 폭별로 정한다.
function Field({ label, hint, plainHint, control = 'input', gap = 'default', style }) {
    return (
        <div className={`reserve-store-form-skeleton-field reserve-store-form-skeleton-field--gap-${gap}`} data-label={label} style={style}>
            <div className="reserve-store-form-skeleton-label">{label}</div>
            <div className={`reserve-store-form-skeleton-control reserve-store-form-skeleton-control--${control}`}>
                {control === 'check' ? WEEKDAYS.map(day => (
                    <span key={day} className="reserve-store-form-skeleton-check"><Bone width={16} height={16} borderRadius={4} /><Bone width={14} height={14} /></span>
                )) : <Bone width={control === 'upload' ? 102 : '100%'} height="100%" borderRadius="var(--reserve-store-form-skeleton-radius)" />}
            </div>
            {hint && <div className="reserve-store-form-skeleton-help"><Text style={hintStyle}>{hint}</Text></div>}
            {plainHint && <div className="reserve-store-form-skeleton-help reserve-store-form-skeleton-help--plain">{plainHint}</div>}
        </div>
    );
}
Field.propTypes = {
    label: PropTypes.string.isRequired,
    hint: PropTypes.node,
    plainHint: PropTypes.node,
    control: PropTypes.oneOf(['input', 'select', 'textarea', 'check', 'upload']),
    gap: PropTypes.oneOf(['default', 'tight', 'none']),
    style: PropTypes.object,
};

// StoreBasicInfo 의 FieldRow 와 같은 배치: 모바일은 세로 쌓기(짧은 선택값만 2열), 그 위는 가로 줄.
// time: 영업 시간 줄 — 900~1023px 에서는 실제 폼처럼 세로로 쌓는다(store-form-layout.css).
function FieldRow({ compact = false, time = false, gap = 'row', children }) {
    return <div className={`reserve-store-form-skeleton-row reserve-store-form-skeleton-row--gap-${gap}${compact ? ' reserve-store-form-skeleton-row--compact' : ''}${time ? ' reserve-store-form-skeleton-row--time' : ''}`}>{children}</div>;
}
FieldRow.propTypes = { compact: PropTypes.bool, time: PropTypes.bool, gap: PropTypes.oneOf(['row', 'tight', 'none']), children: PropTypes.node.isRequired };

const SectionLabel = ({ children }) => (
    <div style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary, fontWeight: fontWeight.medium }}>{children}</Text>
    </div>
);
SectionLabel.propTypes = { children: PropTypes.node.isRequired };

const Divider = ({ top = 4, bottom = 16 }) => (
    <div className="reserve-store-form-skeleton-rule" style={{ margin: `${top}px 0 ${bottom}px` }} />
);
Divider.propTypes = { top: PropTypes.number, bottom: PropTypes.number };

// BasicSection 의 칸 간격: 한 줄 칸 12, 두 칸 줄은 두 컬럼일 때 12·한 컬럼(<900)일 때 FieldRow 기본(18/12).
function BasicSection({ twoColumn }) {
    const rowGap = twoColumn ? 'tight' : 'row';
    return (
        <div className="reserve-store-form-skeleton-column" data-skeleton-section="basic">
            <Field label="가게 이름" gap="tight" />
            <FieldRow compact gap={rowGap}>
                <Field label="예약 방식" control="select" hint={STORE_FORM_SKELETON_HINTS.bookingType} gap="none" />
                <Field label="서비스 분야" control="select" hint={STORE_FORM_SKELETON_HINTS.serviceDomain} gap="none" />
            </FieldRow>
            <Field label="카테고리" hint={STORE_FORM_SKELETON_HINTS.category} gap="tight" />
            <FieldRow compact gap={rowGap}>
                <Field label="예약 단위" control="select" hint={STORE_FORM_SKELETON_HINTS.slot} gap="none" />
                <Field label="연락처" gap="none" />
            </FieldRow>
            <FieldRow time gap={rowGap}>
                <Field label="영업 시간" gap="none" />
                <Field label="브레이크 타임" hint={STORE_FORM_SKELETON_HINTS.breakTimes} gap="none" />
            </FieldRow>
            <Field label="주소" gap="tight" />
            <Field label="가게 소개" control="textarea" gap="none" />
        </div>
    );
}
BasicSection.propTypes = { twoColumn: PropTypes.bool };

function SettingsSection() {
    return (
        <div className="reserve-store-form-skeleton-column" data-skeleton-section="settings">
            <FieldRow compact>
                <Field label="최대 예약 인원" hint={STORE_FORM_SKELETON_HINTS.capacity} gap="none" />
                <Field label="노쇼 예약금" hint={STORE_FORM_SKELETON_HINTS.deposit} gap="none" />
            </FieldRow>
            <FieldRow>
                <Field label="우리동네 배지 기준" control="select" hint={STORE_FORM_SKELETON_HINTS.nearby} gap="none" />
            </FieldRow>
            <Divider />
            <SectionLabel>운영 옵션</SectionLabel>
            <div className="reserve-store-form-skeleton-toggles">
                {STORE_FORM_SKELETON_TOGGLES.map(([key, label, desc]) => (
                    <div className="reserve-store-form-skeleton-toggle" key={key}>
                        <Text className="reserve-store-form-skeleton-toggle-label">{label}</Text>
                        <Text className="reserve-store-form-skeleton-toggle-desc">{desc}</Text>
                        <Bone width={28} height={16} borderRadius={100} style={{ gridArea: 'switch', alignSelf: 'center' }} />
                    </div>
                ))}
            </div>
            <Divider />
            <SectionLabel>휴무 · 예약 범위</SectionLabel>
            <Field label="정기 휴무" control="check" hint={STORE_FORM_SKELETON_HINTS.closedDays} />
            <Field label="운영 기간" hint={STORE_FORM_SKELETON_HINTS.period} />
            <FieldRow>
                <Field label="임시 휴무일" hint={STORE_FORM_SKELETON_HINTS.closedDates} gap="none" />
                <Field label="예약 가능 기간" hint={STORE_FORM_SKELETON_HINTS.advance} gap="none" />
            </FieldRow>
            <Divider />
            <SectionLabel>환불 정책</SectionLabel>
            <FieldRow compact gap="tight">
                <Field label="전액 환불" control="select" gap="none" />
                <Field label="부분 환불" control="select" gap="none" />
                <Field label="부분 환불율" control="select" gap="none" />
            </FieldRow>
            <FieldRow compact gap="none">
                <Field label="예약 마감" control="select" gap="none" />
                <Field label="결제 마감" control="select" gap="none" />
            </FieldRow>
        </div>
    );
}

// 초기 데이터/페이지 청크가 준비되는 동안만 표시한다. 제출 로딩은 실제 폼을 유지한다.
export default function StoreFormSkeleton({ mode = 'create' }) {
    const { isSingleColumn, container, headingGap } = storeFormFrame(useWindowWidth());
    const { title, subtitle } = STORE_FORM_COPY[mode === 'edit' ? 'edit' : 'create'];
    return (
        <PageContainer className="reserve-store-form-page reserve-store-form-skeleton" {...container} style={STORE_FORM_DENSITY_VARS}>
            <div className="reserve-store-form-heading" style={{ marginBottom: headingGap }}>
                <Title level={2} style={{ fontWeight: fontWeight.extrabold, margin: '0 0 8px' }}>{title}</Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>{subtitle}</Text>
            </div>

            {isSingleColumn ? (
                <>
                    <BasicSection />
                    <Divider top={8} bottom={16} />
                    <SettingsSection />
                </>
            ) : (
                <div className="reserve-store-form-skeleton-grid">
                    <BasicSection twoColumn />
                    <div className="reserve-store-form-skeleton-divider" />
                    <SettingsSection />
                </div>
            )}

            <div data-skeleton-section="images">
                <div className="reserve-store-form-skeleton-images-divider"><span>이미지 등록</span></div>
                <Field label="대표 이미지" control="upload"
                    plainHint={<>{STORE_FORM_SKELETON_HINTS.mainImage}<br />JPG · PNG · WEBP · GIF / 새 이미지 전체 합계 최대 {MAX_IMAGE_REQUEST_MB}MB</>} />
                <Field label="상세 이미지 (최대 5장)" control="upload"
                    plainHint={`${STORE_FORM_SKELETON_HINTS.detailImages}${MAX_IMAGE_REQUEST_MB}MB`} />
            </div>

            <div className="reserve-store-form-skeleton-actions" data-skeleton-section="actions">
                <Text style={{ display: 'block', marginBottom: 10, fontSize: fontSize.xs, color: colors.text.tertiary }}>{STORE_FORM_SKELETON_HINTS.draft}</Text>
                <div className="reserve-store-form-skeleton-buttons">
                    <Bone height="100%" borderRadius="var(--reserve-store-form-skeleton-button-radius)" style={{ flex: '1 1 0', minWidth: 0 }} />
                    <Bone height="100%" borderRadius="var(--reserve-store-form-skeleton-button-radius)" style={{ flex: '1 1 0', minWidth: 0 }} />
                </div>
            </div>
        </PageContainer>
    );
}
StoreFormSkeleton.propTypes = { mode: PropTypes.oneOf(['create', 'edit']) };
