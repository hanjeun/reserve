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
    DesktopOutlined,
    SunOutlined,
    MoonOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, FormInput, Avatar, Bone, SegmentedControl, FormSelect } from '../../components/common';
import useTheme, { FONT_OPTIONS, ACCENT_OPTIONS } from '../../hooks/useTheme';
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
import { colors, radius, shadows, fontSize, fontWeight, animation, breakpoints } from '../../styles/tokens';
import { useWindowWidth } from '../../hooks';

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
        // coords 는 Form 필드가 아니라 AddressSearch 의 onMeta 로만 들어오는 값이라 rules 로 못 잡는다.
        // 그래도 사용자가 볼 때는 "주소 칸의 문제"이므로, 토스트 대신 setFields 로 그 칸에 붙인다.
        if (!coords) {
            form.setFields([{ name: 'address', errors: ['검색 결과에서 주소를 선택해주세요'] }]);
            return;
        }
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

    // 상호명 검사는 BusinessForm 의 Form.Item rules 가 이미 막는다 —
    // onFinish 는 검증을 통과해야만 불리므로 여기서 다시 검사하면 절대 안 걸리는 죽은 코드다.
    // (죽은 검사를 남겨두면 "검증이 여기 있다"고 오해해서 진짜 규칙을 못 찾는다)
    const handleUpdate = async () => {
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

    // 상호명·등록증 검사도 BusinessForm 의 rules / license validator 가 담당한다(위 handleUpdate 주석 참고).
    const handleSubmit = async () => {
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
                licenseRequired
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
                licenseRequired
            />
            <PreviewModal />
        </>
    );
};

/**
 * 사업자 인증 입력 폼.
 *
 * ★ 2026-08-06 — 이 탭만 폼 규격 밖에 있었다
 *   마이페이지의 이름·비밀번호·위치 탭은 전부 `Form.Item` + `rules` 라 미입력이면
 *   **입력칸 밑에 빨간 글씨**가 붙는데, 사업자 탭만 useState 객체 + `message.warning` 토스트였다.
 *   그래서 어느 칸이 문제인지 화면에서 알 수 없었고(토스트는 상단에 뜬다) 다른 탭과 감각이 달랐다.
 *   → AntD Form 으로 옮겨 다른 탭과 같은 규격으로 맞춘다.
 *
 *   부모(BusinessTab)는 여전히 `form` state 로 값을 들고 있다(수정 모드 프리필·제출 payload 가
 *   그 값을 쓴다). 그래서 여기서는 AntD Form 을 **입력·검증 계층으로만** 쓰고
 *   `onValuesChange` 로 부모 state 를 계속 동기화한다 — 부모 쪽을 통째로 갈아엎지 않으면서
 *   검증 UX 만 규격에 맞추는 절충이다.
 *
 *   `initialValues` 만 쓰고 setFieldsValue 이펙트를 두지 않는 이유: 수정 모드는
 *   handleStartEdit 가 setForm → setIsEditing 순서로 호출해 **폼이 새 값으로 마운트**되므로
 *   초기값만으로 충분하고, 이펙트를 두면 타이핑 중 값을 되돌릴 위험만 생긴다.
 */
const BusinessForm = ({ form, setForm, fileList, onFileListChange, onPreview, onPreviewClickCapture, beforeUpload, onSubmit, loading, submitLabel = '사업자 인증 신청', licenseRequired = false }) => {
    const [antdForm] = Form.useForm();

    return (
        <Form
            form={antdForm}
            layout="vertical"
            requiredMark={false}
            size="large"
            initialValues={form}
            /* 폼이 들고 있는 필드 중 부모 state 로 넘길 것만 골라 담는다.
               `...all` 로 통째로 넘기면 아래 등록증 검증용 더미 필드(license)까지 섞여
               제출 payload 에 쓸데없는 키가 들어간다. */
            onValuesChange={(_, all) => setForm(f => ({
                ...f,
                businessName: all.businessName ?? '',
                businessNumber: all.businessNumber ?? '',
                memo: all.memo ?? '',
            }))}
            onFinish={onSubmit}
        >
            <div style={{ ...bizStyles.infoNotice, marginBottom: 12 }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>
                    사업자 등록증으로 간단히 인증하고 가게를 등록해보세요
                </Text>
            </div>

            <Form.Item
                name="businessName"
                style={{ marginBottom: 12 }}
                rules={[{ required: true, whitespace: true, message: '상호명을 입력해주세요' }]}
            >
                <FormInput placeholder="상호명 *" />
            </Form.Item>
            <Form.Item name="businessNumber" style={{ marginBottom: 12 }}>
                <FormInput placeholder="사업자 등록번호 (선택)" />
            </Form.Item>
            <Form.Item name="memo" style={{ marginBottom: 12 }}>
                <FormInput placeholder="추가 메모 (선택)" />
            </Form.Item>

            {/* 사업자 등록증 — 가게 이미지 업로드(StoreImages)와 동일한 picture-card Upload + 공유 useImagePreview 재사용.
                눈(미리보기)·휴지통(삭제) 아이콘까지 가게 폼과 완전히 동일하게 동작한다.
                파일은 부모의 fileList 가 들고 있어 Form 의 값이 아니다 → validator 로만 검증한다.
                수정 모드에서는 등록증 재업로드가 선택이라 licenseRequired 로 갈랐다. */}
            <Form.Item
                name="license"
                style={{ marginBottom: 12 }}
                rules={licenseRequired ? [{
                    validator: () => (fileList.length > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error('사업자 등록증 이미지를 업로드해주세요'))),
                }] : undefined}
            >
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
            </Form.Item>

            {/* Button 은 우리 공용 컴포넌트라 htmlType 을 전달하지 않는다 → submit() 을 직접 호출한다. */}
            <Button variant="primary" loading={loading} onClick={() => antdForm.submit()} block>{submitLabel}</Button>
        </Form>
    );
};

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

// ─── 디자인 설정 ─────────────────────────────────────────────────────────────
/**
 * 화면 모양(시스템/라이트/다크)과 글꼴을 고르는 섹션.
 *
 * 컨트롤은 새로 만들지 않고 기존 디자인 시스템을 그대로 쓴다 —
 * 모양은 SegmentedControl(탭처럼 고르는 형태), 글꼴은 FormSelect(∨ 드롭다운).
 * 토글(Switch)을 안 쓴 이유: 모양은 3지선다라 on/off로 표현할 수 없고,
 * 나중에 언어 옵션이 붙어도 같은 두 컨트롤로 확장된다.
 *
 * 설정은 localStorage에 저장된다(기기별). 서버 동기화가 필요해지면
 * Member 컬럼을 추가해 /api/member/me 응답에 실어 보내면 추가 요청 없이 확장된다.
 */
const AppearanceSection = () => {
    const { theme, setTheme, font, setFont, accent, setAccent, resolvedTheme } = useTheme();

    return (
        <div style={styles.notificationSection}>
            <Text strong style={styles.sectionTitle}>디자인</Text>

            <div style={styles.designRow}>
                <div style={styles.designLabel}>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>모양</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                        시스템을 고르면 기기 설정을 따라갑니다
                    </Text>
                </div>
                <SegmentedControl
                    block={false}
                    value={theme}
                    onChange={setTheme}
                    options={[
                        { value: 'system', label: <span><DesktopOutlined /> 시스템</span> },
                        { value: 'light',  label: <span><SunOutlined /> 라이트</span> },
                        { value: 'dark',   label: <span><MoonOutlined /> 다크</span> },
                    ]}
                />
            </div>

            <div style={{ borderTop: `1px solid ${colors.border.light}`, margin: '4px 0' }} />

            {/* ★ 글꼴·포인트 색을 한 줄에 2개로 놓는다.
                예전에는 글꼴 셀렉트 하나가 남는 폭을 전부 차지해서 "얇고 긴 띠"처럼 보였다.
                FormSelect 는 width:100% 라 부모 칸이 폭을 정한다 — 2열 그리드로 칸을 반씩 나누면
                가게 등록 폼(항목이 2열로 놓인 화면)과 같은 비율이 된다.
                모바일(1열)에서는 원래대로 100%가 되는 게 맞다 — 좁은 화면에서 반칸은 너무 좁다. */}
            <div style={styles.designGrid}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>글꼴</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block', marginBottom: 8 }}>
                        앱 전체에 적용됩니다
                    </Text>
                    <FormSelect
                        value={font}
                        onChange={setFont}
                        /* ★ 각 옵션을 **그 글꼴로** 보여준다.
                           예전에는 라벨이 전부 현재 적용된 글꼴로 렌더돼서, 고르기 전에
                           어떤 모양인지 알 수 없었다(글꼴 선택기가 미리보기를 못 하는 셈).
                           fontFamily 를 옵션마다 인라인으로 주면 목록에서 바로 비교된다. */
                        options={FONT_OPTIONS.map(o => ({
                            value: o.value,
                            label: <span style={{ fontFamily: o.stack }}>{o.label}</span>,
                        }))}
                    />
                </div>

                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block' }}>포인트 색</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block', marginBottom: 8 }}>
                        버튼·강조 표시에 쓰입니다
                    </Text>
                    {/* 색은 이름만으로는 고르기 어렵다 — 옵션마다 실제 색 점을 함께 보여준다.
                        점 색은 지금 테마(라이트/다크)에 맞는 값이어야 실제 적용 결과와 일치한다. */}
                    <FormSelect
                        value={accent}
                        onChange={setAccent}
                        options={ACCENT_OPTIONS.map(o => ({
                            value: o.value,
                            label: (
                                // ★ verticalAlign: middle 이 필요하다 — inline-flex 박스의 baseline 은
                                // 첫 flex 항목의 baseline 인데, 그 항목이 글자 없는 색 점이라 baseline 이
                                // 박스 아래끝이 된다. 그러면 줄상자가 늘어나 이 셀렉트만 1px 높아진다
                                // (실측: 글꼴 54.1px vs 포인트색 55.1px). middle 이면 그 영향이 사라진다.
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, verticalAlign: 'middle' }}>
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                                            background: (resolvedTheme === 'dark' ? o.darkMode : o.light).main,
                                        }}
                                    />
                                    {o.label}
                                </span>
                            ),
                        }))}
                    />
                </div>
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
            // 문장 단위 줄바꿈은 useMessage의 confirm 래퍼가 처리한다 — 여기선 평범한 문자열이면 된다.
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

    // PC에서는 좌우 2단으로 나눈다(가게 상세의 pcLeft/pcRight와 같은 패턴).
    // 예전엔 size="sm"(maxWidth 420)이라 PC에서도 모바일 폭 그대로였고 양옆이 텅 비었다.
    // 모바일은 기존 흐름(세로 1열)을 그대로 유지한다 — 폰 화면은 건드리지 않는다는 원칙.
    // 경계는 tablet(768) — 아이패드·갤럭시탭도 PC처럼 2단으로 본다.
    // pc(900)로 잡았더니 아이패드 세로(768~820)가 모바일 1열이라 좌우가 텅 비어 어색했다.
    // 768에서도 성립하는지 계산: 컨테이너 768-48=720, gap 32 → 좌우 합 688.
    // pcLeft basis 420 + pcRight basis 300(minWidth 280)이면 688 안에 들어간다.
    const isPC = useWindowWidth() >= breakpoints.tablet;

    const leftColumn = (
        <>
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
        </>
    );

    const rightColumn = (
        <>
            {/* 디자인(모양·글꼴) */}
            <AppearanceSection />

            <Divider />

            {/* 알림 설정 + 마케팅 수신 동의 (통합 카드) */}
            <NotificationSection user={user} />

            <Divider />

            {/* 회원 탈퇴 */}
            <div style={styles.deleteSection}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.error.main }}>회원 탈퇴</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: fontSize.xs, marginTop: 2 }}>
                        모든 예약·리뷰 데이터가 삭제되며 복구할 수 없습니다
                    </Text>
                </div>
                <Button variant="danger" size="sm" onClick={handleDeleteAccount}
                    style={{ flexShrink: 0, padding: '0 16px', minWidth: 72 }}>
                    탈퇴하기
                </Button>
            </div>
        </>
    );

    // 모바일: 기존과 완전히 동일한 세로 1열(size="sm", 420px). 순서도 그대로 —
    // 프로필 → 내 정보 수정 → [디자인] → 알림 → 탈퇴. 디자인 섹션만 새로 끼어든다.
    if (!isPC) {
        return (
            <PageContainer size="sm" paddingTop="48px">
                {leftColumn}
                <Divider />
                {rightColumn}
            </PageContainer>
        );
    }

    // PC: 좌우 2단. 왼쪽은 프로필·정보수정(입력 위주라 넓게), 오른쪽은 설정·탈퇴.
    // 오른쪽을 sticky로 두면 왼쪽 탭 내용이 길어져도 설정이 따라온다(StoreDetail과 같은 패턴).
    return (
        <PageContainer size="lg" paddingTop="48px">
            <div style={styles.pcGrid}>
                <div style={styles.pcLeft}>{leftColumn}</div>
                <div style={styles.pcRight}>{rightColumn}</div>
            </div>
        </PageContainer>
    );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
    // ── PC 2단 (900px 이상) ──────────────────────────────────────────────────
    // StoreDetail의 pcLeft/pcRight와 같은 구조. gap 32는 두 카드 묶음이 서로 다른 영역으로
    // 읽히기에 충분하면서, 1000px 컨테이너에서 양쪽이 좁아지지 않는 값이다.
    pcGrid:  { display: 'flex', gap: 32, alignItems: 'flex-start' },
    // basis 420/300 — 아이패드 세로(768)에서도 두 열이 들어가는 값이다(위 isPC 주석의 계산 참고).
    // 넓은 화면에서는 grow로 자연스럽게 벌어지고 pcRight의 maxWidth가 오른쪽 폭을 잡아준다.
    pcLeft:  { flex: '1 1 420px', minWidth: 0 },
    // sticky — 왼쪽 탭(위치/사업자 등)이 길어져도 설정이 화면에 남는다.
    // top 80은 고정 헤더(64) + 여백. alignSelf: flex-start가 없으면 flex가 높이를 늘려 sticky가 안 먹는다.
    pcRight: { flex: '1 1 300px', minWidth: 280, maxWidth: 420, position: 'sticky', top: 80, alignSelf: 'flex-start' },

    // 디자인 섹션 — 라벨(왼쪽)과 컨트롤(오른쪽)이 한 줄. 좁아지면 컨트롤이 아래로 내려간다.
    designRow: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', padding: '4px 0',
    },
    designLabel: { minWidth: 0, flex: '1 1 auto' },
    // 글꼴·포인트 색을 한 줄에 2개. 최소 폭을 두어 좁아지면 자동으로 1열이 된다
    // (미디어쿼리 없이 auto-fit + minmax 로 처리 — 브레이크포인트를 하나 더 만들 이유가 없다).
    designGrid: {
        display: 'grid',
        // ★ 2열 고정이다. auto-fit + minmax(200px) 로 뒀더니 이 카드 폭에서 최소폭을 못 채워
        //   1열로 접히고 결과적으로 2줄이 됐다 — "한 줄에 2개, 작게"가 요구사항이므로 고정한다.
        //   좁아지면 각 칸이 함께 좁아질 뿐 줄이 늘지 않는다(가게 등록 폼도 모바일에서 2열을 유지한다).
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 12,
        padding: '4px 0',
    },

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
