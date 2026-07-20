import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Typography, InputNumber, Flex } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { FormTextArea } from '../common';
import { colors } from '../../styles/tokens';

const { Text } = Typography;

/**
 * RESERVE - 관리자 제재 모달 (통합)
 *
 * 2026-07 전수조사로 통합됨. 예전엔 거의 동일한 모달이 4벌 복붙되어 있었다:
 *   MembersTab.jsx      - SuspendModal      / BanModal
 *   StoresAdminTab.jsx  - StoreSuspendModal / StoreBanModal
 * 문구·버튼색·기간 필드 유무만 다르고 구조는 전부 같아서 preset 하나로 합침.
 *
 * ── 닫힘 애니메이션 버그 수정 (이 통합의 진짜 이유) ──────────────────────────────
 * 예전 호출부는 이렇게 되어 있었다:
 *     <SuspendModal key={suspendOpen ? 'suspend-open' : 'suspend-closed'} open={suspendOpen} ... />
 * 모달이 내부 useState(days/reason)를 들고 있어서, 재오픈 시 이전 입력값이 남는 걸 막으려고
 * key로 강제 remount를 시킨 것. 그런데 key가 "닫힐 때도" 바뀌기 때문에 React가 그 순간
 * 컴포넌트를 언마운트해버려서, AntD가 닫힘 애니메이션을 재생할 DOM 자체가 사라졌다.
 * → "열릴 땐 애니메이션이 되는데 닫힐 땐 툭 사라지는" 증상의 원인.
 *
 * antd 6이 정식 지원하는 destroyOnHidden(구 destroyOnClose, deprecated)을 쓰면
 * "닫힘 애니메이션이 끝난 뒤에" 내용을 파괴하므로 애니메이션 보존 + 입력값 리셋을 둘 다 얻는다.
 * 그래서 이 컴포넌트는 내부 상태를 <Modal> children 쪽(SanctionBody)에 두고,
 * Modal에 destroyOnHidden을 걸어 호출부의 key 토글을 완전히 제거했다.
 */

// 파일 내부 전용 상수 — export하면 react-refresh/only-export-components 위반(컴포넌트 외의 것을
// 함께 export하는 파일은 Fast Refresh가 깨짐). 외부에서 쓰는 곳이 없으므로 로컬로 둔다.
const SANCTION_PRESETS = {
    MEMBER_SUSPEND: {
        title: '기간 정지',
        icon: 'warning',
        okText: '정지 적용',
        withDays: true,
        daysLabel: '정지 기간 (일)',
        reasonLabel: '정지 사유 (선택)',
        reasonPlaceholder: '예: 서비스 이용약관 위반',
        maxLength: 200,
        okStyle: 'warning',
    },
    MEMBER_BAN: {
        title: '영구 정지',
        icon: 'danger',
        okText: '영구 정지',
        withDays: false,
        warning: '이 작업은 되돌리기 어렵습니다. 정지 해제 버튼으로 해제할 수 있습니다.',
        reasonLabel: '정지 사유 (선택)',
        reasonPlaceholder: '예: 반복적인 허위 예약',
        maxLength: 200,
        okStyle: 'danger',
    },
    STORE_SUSPEND: {
        title: '영업정지',
        icon: 'warning',
        okText: '영업정지 적용',
        withDays: true,
        daysLabel: '영업정지 기간 (일)',
        reasonLabel: '정지 사유 (선택)',
        reasonPlaceholder: '예: 위생 법규 위반 등',
        maxLength: 200,
        okStyle: 'warning',
    },
    STORE_BAN: {
        title: '영구 폐업',
        icon: 'danger',
        okText: '영구 폐업',
        withDays: false,
        warning: '가게를 영구 폐업 처리합니다. 정지 해제 버튼으로 언제든지 원상복구 가능합니다.',
        reasonLabel: '폐업 사유 (선택)',
        reasonPlaceholder: '예: 반복적인 서비스 이용규정 위반',
        maxLength: 200,
        okStyle: 'danger',
    },
    // 2026-07 추가 — AdminAdsTab의 광고 강제 중단은 사유를 '운영 정책 위반'으로 하드코딩해두고
    // 관리자가 직접 입력할 수 없었다. 회원/가게 제재와 동일한 "사유 입력 + 확인" 패턴이라
    // 이 모달을 그대로 재사용한다.
    AD_SUSPEND: {
        title: '광고 중단',
        icon: 'danger',
        okText: '중단',
        withDays: false,
        warning: '즉시 노출이 내려가며, 사업자가 다시 결제하기 전까지 재노출되지 않습니다.',
        reasonLabel: '중단 사유 (선택)',
        reasonPlaceholder: '예: 운영 정책 위반, 부적절한 이미지 등',
        maxLength: 200,
        okStyle: 'danger',
    },
};

const OK_BUTTON_PROPS = {
    warning: { style: { backgroundColor: '#fa8c16', borderColor: '#fa8c16' } },
    danger:  { danger: true },
};

/**
 * 모달 본문 — days/reason 입력 상태를 여기서 들고 있다.
 * destroyOnHidden 덕에 모달이 완전히 닫힌 뒤 이 컴포넌트가 파괴되므로,
 * 다음에 열릴 때 항상 초기값(days=7, reason='')으로 새로 마운트된다.
 */
const SanctionBody = ({ preset, onReady }) => {
    const [days, setDays] = useState(7);
    const [reason, setReason] = useState('');

    // 부모(Modal의 onOk)가 현재 입력값을 읽을 수 있도록 ref 콜백으로 노출
    onReady({ days, reason });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
            {preset.warning && (
                <Text type="danger" style={{ display: 'block' }}>{preset.warning}</Text>
            )}
            {preset.withDays && (
                <div>
                    <Text style={{ display: 'block', marginBottom: 6 }}>{preset.daysLabel}</Text>
                    <InputNumber min={1} max={365} value={days} onChange={(v) => setDays(v || 7)}
                        style={{ width: '100%' }} />
                </div>
            )}
            <div>
                <Text style={{ display: 'block', marginBottom: 6 }}>{preset.reasonLabel}</Text>
                <FormTextArea rows={3} placeholder={preset.reasonPlaceholder} value={reason}
                    onChange={(e) => setReason(e.target.value)} maxLength={preset.maxLength} showCount />
            </div>
        </div>
    );
};

SanctionBody.propTypes = {
    preset: PropTypes.object.isRequired,
    onReady: PropTypes.func.isRequired,
};

/**
 * @param {string} presetKey  SANCTION_PRESETS의 키 (MEMBER_SUSPEND | MEMBER_BAN | STORE_SUSPEND | STORE_BAN)
 * @param {object} target     제재 대상 (표시용 — name 또는 email 사용)
 * @param {func}   onOk       ({ days, reason }) => void
 */
const SanctionModal = ({ open, presetKey, target, onCancel, onOk, loading }) => {
    const preset = SANCTION_PRESETS[presetKey];
    // SanctionBody가 렌더될 때마다 최신 입력값을 여기에 흘려보낸다 (state가 아니라 ref라 리렌더 안 유발)
    const valuesRef = React.useRef({ days: 7, reason: '' });

    if (!preset) return null;

    const targetLabel = target?.name || target?.email || '';
    const iconColor = preset.icon === 'danger' ? colors.error.main : colors.warning.main;

    return (
        <Modal
            title={
                <Flex align="center" gap={8}>
                    <ExclamationCircleFilled style={{ color: iconColor, fontSize: 18 }} />
                    <span>{targetLabel ? `${preset.title} — ${targetLabel}` : preset.title}</span>
                </Flex>
            }
            open={open}
            onCancel={onCancel}
            onOk={() => onOk({ ...valuesRef.current })}
            okText={preset.okText}
            cancelText="취소"
            okButtonProps={{ ...OK_BUTTON_PROPS[preset.okStyle], loading }}
            centered
            /* destroyOnHidden: 닫힘 애니메이션이 끝난 뒤에 children을 파괴 —
               호출부의 key 토글 없이도 다음 오픈 때 입력값이 깨끗하게 초기화된다. */
            // maskClosable={false}: 정지 기간/사유 입력 — 작성 중인 내용 유실 방지
            // (읽기 전용 모달 — 상세보기/QR/예약상세 — 은 기본값 true 유지)
            maskClosable={false}
            destroyOnHidden
        >
            <SanctionBody preset={preset} onReady={(v) => { valuesRef.current = v; }} />
        </Modal>
    );
};

SanctionModal.propTypes = {
    open: PropTypes.bool,
    presetKey: PropTypes.oneOf(Object.keys(SANCTION_PRESETS)).isRequired,
    target: PropTypes.object,
    onCancel: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    loading: PropTypes.bool,
};

export default SanctionModal;
