import React, { useState, useRef, useEffect } from 'react';
import { Typography, Divider, Form, Switch, Upload, Input, Tabs } from 'antd';
import {
    LockOutlined,
    ExclamationCircleOutlined,
    CameraOutlined,
    UserOutlined,
    ShopOutlined,
    ClockCircleOutlined,
    UploadOutlined,
    EnvironmentOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, FormInput, Avatar, Bone } from '../../components/common';
import AddressSearch from '../../components/store/StoreForm/AddressSearch';
import { useMessage } from '../../hooks';
import { memberService, businessService } from '../../services';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { hasAdminAccess } from '../../constants/roles';
import { handleApiError } from '../../utils/errorHandler';
import { VALIDATION_RULES } from '../../utils/validation';
import useAuthStore from '../../store/useAuthStore';
import useExitAnimation from '../../hooks/useExitAnimation';
import useImagePreview from '../../hooks/useImagePreview';
import { useNavigate } from 'react-router-dom';
import { colors, radius, shadows, fontSize, fontWeight, animation } from '../../styles/tokens';

const { Text } = Typography;

// ─── 이름 변경 탭 ─────────────────────────────────────────────────────────────

const NameTab = ({ user }) => {
    const { message } = useMessage();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const onFinish = async ({ name }) => {
        setLoading(true);
        try {
            await memberService.updateMember({ name });
            useAuthStore.getState().login({ ...user, name });
            message.success('이름이 변경되었습니다');
        } catch (err) {
            handleApiError(err, message, '이름 변경에 실패했습니다');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form form={form} layout="vertical" onFinish={onFinish}
            initialValues={{ name: user?.name }} requiredMark={false} size="large">
            <Form.Item name="name" style={{ marginBottom: 16 }} rules={[
                { required: true, message: '이름을 입력해주세요' },
                { min: 2, max: 20, message: '2~20자 사이로 입력해주세요' },
            ]}>
                <FormInput placeholder="새 이름" />
            </Form.Item>
            <Button variant="primary" htmlType="submit" loading={loading} block>저장</Button>
        </Form>
    );
};

// ─── 비밀번호 변경 탭 ─────────────────────────────────────────────────────────

const PasswordTab = () => {
    const { message } = useMessage();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const onFinish = async ({ currentPassword, newPassword, confirmPassword }) => {
        setLoading(true);
        try {
            await memberService.updateMember({ password: newPassword, passwordConfirm: confirmPassword, currentPassword });
            message.success('비밀번호가 변경되었습니다');
            form.resetFields();
        } catch (err) {
            handleApiError(err, message, '비밀번호 변경에 실패했습니다');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
            <div style={styles.securityNotice}>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>
                    영문+숫자 조합 8자 이상을 권장해요
                </Text>
            </div>
            <Form.Item name="currentPassword" style={{ marginBottom: 16 }}
                rules={[{ required: true, message: '현재 비밀번호를 입력해주세요' }]}>
                <FormInput type="password" placeholder="현재 비밀번호" />
            </Form.Item>
            <Form.Item name="newPassword" style={{ marginBottom: 16 }} rules={[
                { required: true, message: '새 비밀번호를 입력해주세요' },
                { min: 8, message: '8자 이상 입력해주세요' },
                { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: '영문과 숫자를 포함해야 합니다' },
            ]}>
                <FormInput type="password" placeholder="새 비밀번호 (영문+숫자 8자 이상)" />
            </Form.Item>
            <Form.Item name="confirmPassword" style={{ marginBottom: 16 }} dependencies={['newPassword']} rules={[
                { required: true, message: '비밀번호 확인을 입력해주세요' },
                ({ getFieldValue }) => ({
                    validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                        return Promise.reject(new Error('비밀번호가 일치하지 않습니다'));
                    },
                }),
            ]}>
                <FormInput type="password" placeholder="새 비밀번호 확인" />
            </Form.Item>
            <Button variant="primary" htmlType="submit" loading={loading} block>변경</Button>
        </Form>
    );
};

// ─── 프로필 사진 탭 ───────────────────────────────────────────────────────────
//
// pendingImage state 하나로 모든 경우를 표현:
//   null      → 변경 없음 (버튼 숨김)
//   'reset'   → 기본 이미지로 되돌리기 의도
//   File 객체 → 새 이미지 선택
//
// 취소 → pendingImage = 'reset'  (미리보기만 기본 아이콘으로, 서버 반영 없음)
// 저장 → File이면 업로드, 'reset'이면 서버 삭제, null이면 no-op

const ProfileImageTab = ({ user }) => {
    const { message, confirm } = useMessage();
    const [loading, setLoading] = useState(false);
    // pending: null | 'reset' | { file: File, previewUrl: string }
    const [pending, setPending] = useState(null);
    const fileInputRef = useRef(null);

    React.useEffect(() => {
        return () => {
            if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        };
    }, [pending?.previewUrl]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            message.error('이미지 파일만 업로드 가능합니다');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            message.error('파일 크기는 5MB 이하만 가능합니다');
            return;
        }
        if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        setPending({ file, previewUrl: URL.createObjectURL(file) });
    };

    const handleCancel = () => {
        if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        setPending(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            if (pending?.file) {
                await memberService.uploadProfileImage(pending.file);
                message.success('프로필 사진이 변경되었습니다');
            }
            await useAuthStore.getState().checkAuth(true);
            setPending(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            handleApiError(err, message, '프로필 사진 변경에 실패했습니다');
        } finally {
            setLoading(false);
        }
    };

    const handleResetToDefault = () => {
        confirm({
            title: '기본 이미지로 변경',
            content: '현재 프로필 사진을 삭제하고 기본 이미지로 되돌립니다. 계속하시겠습니까?',
            okText: '변경', cancelText: '취소', centered: true,
            onOk: async () => {
                setLoading(true);
                try {
                    await memberService.deleteProfileImage();
                    message.success('기본 이미지로 변경되었습니다');
                    await useAuthStore.getState().checkAuth(true);
                } catch (err) {
                    handleApiError(err, message, '프로필 사진 변경에 실패했습니다');
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const previewSrc = pending?.previewUrl ?? (user?.profileImageUrl || user?.profileImage);
    // 취소/저장 버튼 행 — 새 이미지를 고르면 슬라이드 인으로 나타나는데, 취소를 누르면(pending이 null이
    // 되는 순간) 그 자리에서 바로 사라져서 "열릴 땐 애니메이션, 닫힐 땐 즉시"였던 것을 수정
    const showButtons = !!pending?.file;
    const { shouldRender: buttonsShouldRender, isClosing: buttonsClosing } = useExitAnimation(showButtons, 200);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>

            {/* 원형 미리보기 — 클릭 시 파일 선택 */}
            <div
                style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}
                onClick={() => !loading && fileInputRef.current?.click()}
            >
                <Avatar
                    key={previewSrc ?? 'default'}
                    src={previewSrc}
                    size={80}
                    style={pending?.previewUrl ? { animation: animation.scaleSpringIn } : undefined}
                />
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />

            <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                클릭하여 사진 변경
            </Text>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 4 }}>
                {buttonsShouldRender ? (
                    <div style={{ display: 'flex', gap: 8, animation: buttonsClosing ? animation.slideUpOut : animation.slideUpIn }}>
                        <Button variant="secondary" onClick={handleCancel} disabled={loading} style={{ flex: 1 }}>
                            취소
                        </Button>
                        <Button variant="primary" onClick={handleSave} loading={loading} style={{ flex: 1 }}>
                            저장
                        </Button>
                    </div>
                ) : (
                    <button
                        onClick={handleResetToDefault}
                        disabled={loading}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: fontSize.sm,
                            color: colors.text.tertiary,
                            textDecoration: 'underline',
                            textUnderlineOffset: '3px',
                            padding: '2px 0',
                            marginTop: -2,
                            opacity: loading ? 0.5 : 1,
                        }}
                    >
                        기본 이미지로 변경
                    </button>
                )}
            </div>
        </div>
    );
};

// ─── 위치 등록 탭 (거리순 가게 정렬 폴백용) ────────────────────────────────────────
// 2026-07 전수조사 — "위치를 분명 저장했는데 저장 안 된 것처럼 보임" 버그 수정:
// 저장 자체는 잘 되고 있었다(DB에 좌표가 들어가고 거리순 정렬/우리동네 배지도 정상 동작).
// 문제는 화면이었다 — member 테이블에 좌표만 있고 주소 문자열 컬럼이 없어서, 탭을 다시 열면
//   - AddressSearch는 항상 빈칸 (좌표로 주소를 역산할 수 없으니 프리필할 데이터가 없음)
//   - coords는 로컬 state라 마운트 시마다 null → disabled={!coords}로 버튼이 항상 비활성
// 이 조합 때문에 사용자 입장에선 "저장이 안 됐다"고 보였다.
// → 백엔드에 location_address 컬럼을 추가해 주소 문자열까지 보관하고, 여기서 그걸 프리필한다.
const LocationTab = ({ user }) => {
    const { message } = useMessage();
    const [form] = Form.useForm();

    const hasSaved = user?.latitude != null && user?.longitude != null;

    // 좌표(latitude/longitude)는 AddressSearch의 onMeta 콜백으로만 들어오는 값이라 일반 폼 필드로 다루기
    // 애매해서(사용자가 직접 입력하는 값이 아니라 검색 결과 선택 시에만 바뀜) 별도 state로 관리한다.
    const [coords, setCoords] = useState(
        hasSaved ? { latitude: user.latitude, longitude: user.longitude } : null
    );
    const [loading, setLoading] = useState(false);

    // 주소 컬럼이 생기기 전에 위치를 등록한 기존 회원은 좌표만 있고 주소는 null이다.
    // "위치는 등록되어 있지만 그게 어떤 주소인지는 보여줄 수 없는" 상태임을 안내문으로 따로 알린다.
    const savedWithoutAddress = hasSaved && !user?.locationAddress;

    // 2026-07 추가 — 주소를 새로 채우고 나서 address/addressDetail만 지우면 zipCode만 남는
    // 버그를 막기 위해 버튼을 임의로 disable하는 대신 disabled={!coords}만 검사하고 address/detail이
    // 비어있어도 무시하고 있었는데, StoreBasicInfo(가게 주소)와 동일한 컨벤션으로 바꿔서 프로젝트에서
    // 필수 텍스트 필드는 Form.Item + VALIDATION_RULES로 검증하고 미입력이면 버튼은 그대로 눌리게 하되
    // 빨간 테두리 + 메시지가 뜨는 식 — 즉 NameTab/PasswordTab/StoreBasicInfo와 동일한 패턴으로 통일.
    // coords는 Form 필드가 아니라 onMeta로만 들어오는 별도 값이라 rules로는 검증 못해서, Form 검증이 통과된
    // 다음(onFinish 안)에 추가로 확인한다.
    const onFinish = async (values) => {
        if (!coords) { message.warning('검색 결과에서 주소를 선택해주세요'); return; }
        setLoading(true);
        try {
            await memberService.updateLocation({
                latitude: coords.latitude,
                longitude: coords.longitude,
                address: values.address,
                zipCode: values.zipCode,
                addressDetail: values.addressDetail,
            });
            await useAuthStore.getState().checkAuth(true);
            message.success('위치가 등록되었습니다');
        } catch (err) {
            handleApiError(err, message, '위치 등록에 실패했습니다');
        } finally {
            setLoading(false);
        }
    };

    let noticeText;
    if (user?.locationAddress) {
        const full = [user.locationAddress, user.locationAddressDetail].filter(Boolean).join(' ');
        noticeText = `등록된 위치: ${full} — 거리순 가게 목록에서 위치 권한을 허용하지 않았을 때 이 주소가 기준이 돼요. 바꾸려면 아래에서 다시 검색하세요.`;
    } else if (savedWithoutAddress) {
        noticeText = '등록된 위치가 있어요. 다만 주소가 함께 저장되기 전에 등록된 거라 어떤 주소인지 표시할 수가 없어요. 아래에서 다시 검색해 저장하면 주소까지 함께 기록돼요.';
    } else {
        noticeText = '위치 권한을 허용하지 않았다면, 여기에 주소를 등록해두면 그 주소 기준으로 거리순 정렬을 이용할 수 있어요.';
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* securityNotice는 PasswordTab과 공유하는데 marginBottom:16이 들어있다. 여기는
                외부 컨테이너가 flex+gap:12로 이미 간격을 만들므로, 안내박스의 marginBottom까지
                더해지면 이 줄 아래만 28px로 과도하게 벌어져 위아래 간격이 어깧난다 — 0으로 상쇄. */}
            <div style={{ ...styles.securityNotice, marginBottom: 0 }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>
                    {noticeText}
                </Text>
            </div>
            <Form
                form={form}
                onFinish={onFinish}
                layout="vertical"
                requiredMark={false}
                initialValues={{
                    address: user?.locationAddress || '',
                    zipCode: user?.locationZipCode || '',
                    addressDetail: user?.locationAddressDetail || '',
                }}
            >
                {/* AddressSearch가 도로명·우편번호·상세주소를 한 세트로 다룬다. Form.Item(name="address")이
                    value/onChange를 자동으로 주입해줌(StoreBasicInfo와 동일한 방식). 가게 등록 폼과 동일하게
                    주소 필드만 rules로 검증한다 — 상세주소는 실제로 선택적인 주소가 많아(단독주택 등)
                    필수로 강제하지 않는다. */}
                <Form.Item name="address" rules={VALIDATION_RULES.address} style={{ marginBottom: 12 }}>
                    <AddressSearch
                        zipCode={user?.locationZipCode || ''}
                        addressDetail={user?.locationAddressDetail || ''}
                        onMeta={(meta) => {
                            // 2026-07 추가 — 좀 있으면 setCoords를 건너뛰고 이전 좌표가 그대로 남았다.
                            // AddressSearch가 주소를 고치려고 재포커스할 때 onMeta({ latitude: null, ... })를
                            // 보내는데, 여기서 null을 무시하면 새 주소를 타이핑만 하고 드롭다운에서
                            // 다시 선택하지 않은 채 저장하면 이전 주소의 좌표가 새 주소에 붙어버린다.
                            // 그래서 명시적으로 null이면 coords도 다시 null로 비우고, onFinish의 이건 가드가 다시 걸리게 한다.
                            setCoords(meta.latitude && meta.longitude ? { latitude: meta.latitude, longitude: meta.longitude } : null);
                            form.setFieldsValue({ zipCode: meta.zipCode ?? '', addressDetail: meta.addressDetail ?? '' });
                        }}
                        onDetailChange={(v) => form.setFieldsValue({ addressDetail: v })}
                        placeholder="도로명 또는 지번 주소를 검색하세요"
                    />
                </Form.Item>
                <Form.Item name="zipCode" hidden><Input /></Form.Item>
                <Form.Item name="addressDetail" hidden><Input /></Form.Item>
                <Button variant="primary" htmlType="submit" loading={loading} block>
                    위치 저장
                </Button>
            </Form>
        </div>
    );
};

// ─── 사업자 전환 탭 ───────────────────────────────────────────────────────────
const BusinessTab = ({ user }) => {
    const { message, confirm } = useMessage();
    const [status, setStatus]     = useState(null);
    const [rejectionReason, setRejectionReason] = useState(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [form, setForm]         = useState({ businessName: '', businessNumber: '', memo: '' });
    const [licenseList, setLicenseList] = useState([]);
    const { handlePreview, PreviewModal, suppressLinkNavigation } = useImagePreview();
    const [submitLoading, setSubmitLoading] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [resignLoading, setResignLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const isBusiness = user?.role === 'BUSINESS';

    useEffect(() => {
        if (isBusiness) { setStatusLoading(false); return; }
        businessService.getMyStatus()
            .then(res => {
                setStatus(res?.status ?? null);
                setRejectionReason(res?.rejectionReason ?? null);
            })
            .catch(() => setStatus(null))
            .finally(() => setStatusLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 사업자 등록증도 가게 이미지와 동일한 picture-card Upload + 공유 useImagePreview로 통일.
    // AntD Upload가 fileList/썸네일을 관리하므로 별도 blob URL 관리가 필요 없다.
    const licenseFile = licenseList[0]?.originFileObj ?? null;
    const handleLicenseChange = ({ fileList }) => setLicenseList(fileList);
    const beforeUploadLicense = (file) => {
        if (!file.type.startsWith('image/')) { message.error('이미지 파일만 업로드 가능합니다'); return Upload.LIST_IGNORE; }
        if (file.size > 5 * 1024 * 1024) { message.error('5MB 이하 파일만 가능합니다'); return Upload.LIST_IGNORE; }
        return false;
    };

    const handleUpdate = async () => {
        if (!form.businessName.trim()) return message.warning('상호명을 입력해주세요');
        setUpdateLoading(true);
        try {
            await businessService.update({ ...form, licenseImage: licenseFile || undefined });
            message.success('수정되었습니다.');
            setIsEditing(false);
            setLicenseList([]);
        } catch (err) {
            handleApiError(err, message, '수정에 실패했습니다');
        } finally {
            setUpdateLoading(false);
        }
    };

    // 수정 모드 진입 시 기존 데이터 자동 채우기
    const handleStartEdit = async () => {
        try {
            const current = await businessService.getMyStatus();
            setForm({
                businessName: current?.businessName || '',
                businessNumber: current?.businessNumber || '',
                memo: current?.memo || '',
            });
        } catch {
            // 실패 시 빈 폼으로 시작
        }
        setIsEditing(true);
    };

    const handleSubmit = async () => {
        if (!form.businessName.trim()) return message.warning('상호명을 입력해주세요');
        if (!licenseFile) return message.warning('사업자 등록증 이미지를 업로드해주세요');
        setSubmitLoading(true);
        try {
            await businessService.submit({ ...form, licenseImage: licenseFile });
            message.success('사업자 인증 신청이 완료되었습니다. 관리자 승인 후 이용 가능합니다.');
            setStatus('PENDING');
        } catch (err) {
            handleApiError(err, message, '신청에 실패했습니다');
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleCancel = () => {
        confirm({
            title: '신청 취소', content: '사업자 인증 신청을 취소하시겠습니까?',
            okText: '취소하기', cancelText: '닫기', okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                setCancelLoading(true);
                try {
                    await businessService.cancel();
                    message.success('신청이 취소되었습니다');
                    setStatus(null);
                    setForm({ businessName: '', businessNumber: '', memo: '' });
                    setLicenseList([]);
                } catch (err) {
                    handleApiError(err, message, '취소에 실패했습니다');
                } finally {
                    setCancelLoading(false);
                }
            },
        });
    };

    const handleResign = () => {
        confirm({
            title: '사업자 자격 포기',
            content: '사업자 자격을 포기하면 가게 관리 및 예약 수신이 불가합니다. 정말 포기하시겠습니까?',
            okText: '포기하기', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                setResignLoading(true);
                try {
                    await businessService.resign();
                    await useAuthStore.getState().checkAuth(true);
                    message.success('사업자 자격이 포기되었습니다');
                } catch (err) {
                    handleApiError(err, message, '처리에 실패했습니다');
                } finally {
                    setResignLoading(false);
                }
            },
        });
    };

    if (statusLoading) return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Bone height={36} borderRadius={radius.lg} />
            <Bone height={44} borderRadius={radius.lg} />
            <Bone height={44} borderRadius={radius.lg} />
            <Bone height={44} borderRadius={radius.lg} />
            <Bone height={100} borderRadius={radius.lg} />
            <Bone height={46} borderRadius={radius.xl} />
        </div>
    );

    // ── 사업자 이미 완료 ──
    if (isBusiness) return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={bizStyles.statusCard('success')}>
                <div>
                    <Text strong style={{ color: colors.text.primary, display: 'block', marginBottom: 2 }}>파트너 사장님으로 활동 중이에요</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>가게 등록 및 예약 관리 기능을 이용할 수 있습니다</Text>
                </div>
            </div>
            <div style={bizStyles.resignSection}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.error.main }}>사업자 자격 포기</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: fontSize.xs, marginTop: 2 }}>
                        포기 시 가게 관리 기능을 더 이상 이용할 수 없습니다
                    </Text>
                </div>
                <Button variant="danger" size="sm" loading={resignLoading} onClick={handleResign}
                    style={{ flexShrink: 0, padding: '0 16px', minWidth: 72 }}>
                    포기하기
                </Button>
            </div>
        </div>
    );

    // ── 심사 대기중 ──
    if (status === 'PENDING') {
        // 수정 모드일 때는 폼 표시
        if (isEditing) return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={bizStyles.statusCard('warning')}>
                    <ClockCircleOutlined style={{ fontSize: 20, color: colors.warning.main }} />
                    <div>
                        <Text strong style={{ color: colors.text.primary, display: 'block', marginBottom: 2 }}>신청 내용 수정</Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>수정 후 저장하면 기존 신청이 업데이트됩니다</Text>
                    </div>
                </div>
                <BusinessForm
                    form={form} setForm={setForm}
                    fileList={licenseList} onFileListChange={handleLicenseChange}
                    onPreview={handlePreview} onPreviewClickCapture={suppressLinkNavigation}
                    beforeUpload={beforeUploadLicense}
                    onSubmit={handleUpdate} loading={updateLoading}
                    submitLabel="수정 저장"
                />
                <PreviewModal />
                <Button variant="secondary" onClick={() => setIsEditing(false)} block>취소</Button>
            </div>
        );

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={bizStyles.statusCard('warning')}>
                    <ClockCircleOutlined style={{ fontSize: 20, color: colors.warning.main }} />
                    <div>
                        <Text strong style={{ color: colors.text.primary, display: 'block', marginBottom: 2 }}>심사 중이에요</Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>관리자 검토 후 승인 여부를 알려드립니다</Text>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" loading={cancelLoading} onClick={handleCancel} style={{ flex: 1 }}>신청 취소</Button>
                    <Button variant="primary" onClick={handleStartEdit} style={{ flex: 1 }}>수정하기</Button>
                </div>
            </div>
        );
    }

    // ── 거절됨 ──
    if (status === 'REJECTED') return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={bizStyles.statusCard('error')}>
                <div>
                    <Text strong style={{ color: colors.text.primary, display: 'block', marginBottom: 2 }}>인증이 거절되었습니다</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>내용을 수정하여 다시 신청할 수 있습니다</Text>
                </div>
            </div>
            {status === 'REJECTED' && rejectionReason && (
                <div style={{
                    background: '#fff2f0', border: '1px solid #ffccc7',
                    borderRadius: radius.lg, padding: '12px 14px'
                }}>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block', marginBottom: 4 }}>거절 사유</Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.error.main }}>{rejectionReason}</Text>
                </div>
            )}
            <BusinessForm
                form={form} setForm={setForm}
                fileList={licenseList} onFileListChange={handleLicenseChange}
                onPreview={handlePreview} onPreviewClickCapture={suppressLinkNavigation}
                beforeUpload={beforeUploadLicense}
                onSubmit={handleSubmit} loading={submitLoading}
            />
            <PreviewModal />
        </div>
    );

    // ── 미신청 (기본) ──
    return (
        <>
            <BusinessForm
                form={form} setForm={setForm}
                fileList={licenseList} onFileListChange={handleLicenseChange}
                onPreview={handlePreview} onPreviewClickCapture={suppressLinkNavigation}
                beforeUpload={beforeUploadLicense}
                onSubmit={handleSubmit} loading={submitLoading}
            />
            <PreviewModal />
        </>
    );
};

const BusinessForm = ({ form, setForm, fileList, onFileListChange, onPreview, onPreviewClickCapture, beforeUpload, onSubmit, loading, submitLabel = '사업자 인증 신청' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={bizStyles.infoNotice}>
            <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>
                사업자 등록증으로 간단히 인증하고 가게를 등록해보세요
            </Text>
        </div>

        <FormInput
            placeholder="상호명 *"
            value={form.businessName}
            onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
        />
        <FormInput
            placeholder="사업자 등록번호 (선택)"
            value={form.businessNumber}
            onChange={e => setForm(f => ({ ...f, businessNumber: e.target.value }))}
        />
        <FormInput
            placeholder="추가 메모 (선택)"
            value={form.memo}
            onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
        />

        {/* 사업자 등록증 — 가게 이미지 업로드(StoreImages)와 동일한 picture-card Upload + 공유 useImagePreview 재사용.
            눈(미리보기)·휴지통(삭제) 아이콘까지 가게 폼과 완전히 동일하게 동작한다. */}
        <Upload
            listType="picture-card"
            fileList={fileList}
            onChange={onFileListChange}
            onPreview={onPreview}
            onClickCapture={onPreviewClickCapture}
            beforeUpload={beforeUpload}
            accept="image/*"
            maxCount={1}
        >
            {fileList.length === 0 && (
                <div>
                    <UploadOutlined style={{ fontSize: 20, color: colors.text.tertiary }} />
                    <div style={{ marginTop: 8, fontSize: fontSize.xs, color: colors.text.tertiary }}>사업자 등록증 *</div>
                </div>
            )}
        </Upload>

        <Button variant="primary" loading={loading} onClick={onSubmit} block>{submitLabel}</Button>
    </div>
);

const bizStyles = {
    statusCard: (type) => ({
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '16px',
        backgroundColor: type === 'success' ? colors.success.light
            : type === 'warning' ? colors.warning.light
            : colors.error.light,
        borderRadius: radius.xl,
    }),
    infoNotice: {
        display: 'flex', alignItems: 'center', gap: 6,
        backgroundColor: colors.primary.light,
        borderRadius: radius.lg, padding: '8px 12px',
    },
    resignSection: {
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
        padding: '16px',
        backgroundColor: colors.background.paper,
        borderRadius: radius.xl,
        border: `1px solid ${colors.error.light}`,
    },
};

// ─── 알림 설정 + 마케팅 수신 동의 (하나의 카드로 통합) ────────────────────────

const NotificationSection = ({ user }) => {
    const { message } = useMessage();

    // ── 예약 알림 ──
    const [notiEnabled, setNotiEnabled] = useState(
        typeof user?.emailNotificationEnabled === 'boolean' ? user.emailNotificationEnabled : true
    );
    const [notiLoading, setNotiLoading] = useState(false);

    // ── 마케팅 수신 ──
    const [marketingAgreed, setMarketingAgreed] = useState(user?.marketingAgreed ?? false);
    const [marketingLoading, setMarketingLoading] = useState(false);

    // user 갱신(checkAuth) 시 동기화
    useEffect(() => {
        if (typeof user?.emailNotificationEnabled === 'boolean') setNotiEnabled(user.emailNotificationEnabled);
    }, [user?.emailNotificationEnabled]);

    useEffect(() => {
        if (typeof user?.marketingAgreed === 'boolean') setMarketingAgreed(user.marketingAgreed);
    }, [user?.marketingAgreed]);

    const handleNotiToggle = async (checked) => {
        setNotiLoading(true);
        try {
            await memberService.updateMember({ emailNotificationEnabled: checked });
            setNotiEnabled(checked);
            useAuthStore.getState().login({ ...user, emailNotificationEnabled: checked });
            message.success(checked ? '메일 알림에 동의했습니다' : '메일 알림 동의를 철회했습니다');
        } catch (err) {
            handleApiError(err, message, '설정 변경에 실패했습니다');
        } finally {
            setNotiLoading(false);
        }
    };

    const handleMarketingToggle = async (checked) => {
        setMarketingLoading(true);
        try {
            await memberService.updateMarketingConsent(checked);
            setMarketingAgreed(checked);
            useAuthStore.getState().login({ ...user, marketingAgreed: checked });
            message.success(checked ? '마케팅 수신에 동의했습니다' : '마케팅 수신 동의를 철회했습니다');
        } catch (err) {
            handleApiError(err, message, '설정 변경에 실패했습니다');
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

// ─── MyPage 메인 ─────────────────────────────────────────────────────────────

const MyPage = () => {
    const navigate = useNavigate();
    const { user, logout, checkAuth } = useAuthStore();
    const { message, confirm } = useMessage();
    useDocumentTitle('마이페이지');

    // 마이페이지 진입 시 항상 최신 user 정보를 서버에서 재조회 (localStorage 캐시 신뢰하지 않음)
    useEffect(() => { checkAuth(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDeleteAccount = () => {
        confirm({
            title: '회원 탈퇴',
            icon: <ExclamationCircleOutlined style={{ color: colors.error.main }} />,
            content: '탈퇴하면 모든 데이터가 삭제되며 복구할 수 없습니다. 정말 탈퇴하시겠습니까?',
            okText: '탈퇴하기',
            cancelText: '취소',
            okButtonProps: { danger: true },
            centered: true,
            onOk: async () => {
                try {
                    await memberService.deleteMember();
                    logout();
                    navigate('/', { replace: true });
                    message.success('탈퇴가 완료되었습니다');
                } catch (err) {
                    handleApiError(err, message, '탈퇴에 실패했습니다');
                }
            },
        });
    };

    const isSocialUser = user?.provider && user.provider !== 'LOCAL';

    const tabItems = [
        {
            key: 'name',
            label: <span style={styles.tabLabel}><UserOutlined style={{ marginRight: 6 }} />이름</span>,
            children: <NameTab user={user} />,
        },
        ...(!isSocialUser ? [{
            key: 'password',
            label: <span style={styles.tabLabel}><LockOutlined style={{ marginRight: 6 }} />비밀번호</span>,
            children: <PasswordTab />,
        }] : []),
        {
            key: 'photo',
            label: <span style={styles.tabLabel}><CameraOutlined style={{ marginRight: 6 }} />사진</span>,
            children: <ProfileImageTab user={user} />,
        },
        {
            key: 'location',
            label: <span style={styles.tabLabel}><EnvironmentOutlined style={{ marginRight: 6 }} />위치</span>,
            children: <LocationTab user={user} />,
        },
        ...(!hasAdminAccess(user?.role) ? [{
            key: 'business',
            label: <span style={styles.tabLabel}><ShopOutlined style={{ marginRight: 6 }} />사업자</span>,
            children: <BusinessTab user={user} />,
        }] : []),
    ];

    return (
        <PageContainer size="sm" paddingTop="48px">

            {/* 프로필 헤더 */}
            <div style={styles.profileHeader}>
                <Avatar src={user?.profileImageUrl || user?.profileImage} size={56} />
                <div>
                    <Text strong style={styles.userName}>{user?.name}</Text>
                    <Text style={styles.userEmail}>{user?.email}</Text>
                    {user?.role !== 'USER' && (
                        <Text style={styles.userRole}>
                            {user?.role === 'BUSINESS' ? '파트너 사장님' : '시스템 관리자'}
                        </Text>
                    )}
                </div>
            </div>

            {/* 정보 수정 탭 */}
            <div style={styles.tabsCard}>
                <Text strong style={styles.sectionTitle}>내 정보 수정</Text>
                <Tabs defaultActiveKey="name" items={tabItems} className="reserve-pill-tabs" tabBarGutter={4} animated={{ inkBar: true, tabPane: false }} />
            </div>

            <Divider />

            {/* 알림 설정 + 마케팅 수신 동의 (통합 카드) */}
            <NotificationSection user={user} />

            <Divider />

            {/* 회원 탈퇴 */}
            <div style={styles.deleteSection}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.error.main }}>회원 탈퇴</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: fontSize.xs, marginTop: 2 }}>
                        탈퇴 시 모든 예약·리뷰 데이터가 삭제되며 복구할 수 없습니다
                    </Text>
                </div>
                <Button variant="danger" size="sm" onClick={handleDeleteAccount}
                    style={{ flexShrink: 0, padding: '0 16px', minWidth: 72 }}>
                    탈퇴하기
                </Button>
            </div>

        </PageContainer>
    );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
    profileHeader: {
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '20px 24px',
        backgroundColor: colors.background.paper,
        borderRadius: radius['2xl'],
        border: `1px solid ${colors.border.light}`,
        boxShadow: shadows.card,
        marginBottom: 24,
    },
    userName: {
        display: 'block', fontSize: fontSize.lg,
        fontWeight: fontWeight.bold, color: colors.text.primary, lineHeight: 1.4,
    },
    userEmail: { display: 'block', fontSize: fontSize.sm, color: colors.text.tertiary },
    userRole: {
        display: 'block', fontSize: fontSize.xs,
        color: colors.primary.main, fontWeight: fontWeight.semibold, marginTop: 2,
    },
    tabsCard: {
        backgroundColor: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius['2xl'],
        padding: '20px',
        boxShadow: shadows.card,
        marginBottom: 8,
    },
    sectionTitle: {
        display: 'block', fontSize: fontSize.base,
        fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 16,
    },
    tabLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    securityNotice: {
        display: 'flex', alignItems: 'center', gap: 6,
        backgroundColor: colors.primary.light,
        borderRadius: radius.lg, padding: '8px 12px', marginBottom: 16,
    },
    deleteSection: {
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
        padding: '20px 24px',
        backgroundColor: colors.background.paper,
        borderRadius: radius['2xl'],
        border: `1px solid ${colors.error.light}`,
        boxShadow: shadows.card,
    },
    notificationSection: {
        backgroundColor: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius['2xl'],
        padding: '20px 24px',
        boxShadow: shadows.card,
    },
    notifRow: {
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
        padding: '8px 0',
    },
};

export default MyPage;
