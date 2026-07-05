import React, { useState, useRef, useEffect } from 'react';
import { Typography, Divider, Form, Tabs, Switch, Image } from 'antd';
import {
    LockOutlined,
    ExclamationCircleOutlined,
    CameraOutlined,
    UserOutlined,
    ShopOutlined,
    ClockCircleOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, FormInput, Avatar, Bone } from '../../components/common';
import { useMessage } from '../../hooks';
import { memberService, businessService } from '../../services';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { hasAdminAccess } from '../../constants/roles';
import { handleApiError } from '../../utils/errorHandler';
import useAuthStore from '../../store/useAuthStore';
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
                {pending?.file ? (
                    <div style={{ display: 'flex', gap: 8, animation: animation.slideUpIn }}>
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

// ─── 사업자 전환 탭 ─────────────────────────────────────────────────────────────

const BusinessTab = ({ user }) => {
    const { message, confirm } = useMessage();
    const [status, setStatus]     = useState(null);
    const [rejectionReason, setRejectionReason] = useState(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [form, setForm]         = useState({ businessName: '', businessNumber: '', memo: '' });
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [resignLoading, setResignLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const fileInputRef = useRef(null);

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

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return message.error('이미지 파일만 업로드 가능합니다');
        if (file.size > 5 * 1024 * 1024) return message.error('5MB 이하 파일만 가능합니다');
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const handleUpdate = async () => {
        if (!form.businessName.trim()) return message.warning('상호명을 입력해주세요');
        setUpdateLoading(true);
        try {
            await businessService.update({ ...form, licenseImage: imageFile || undefined });
            message.success('수정되었습니다.');
            setIsEditing(false);
            setImageFile(null);
            setImagePreview(null);
        } catch (err) {
            handleApiError(err, message, '수정에 실패했습니다');
        } finally {
            setUpdateLoading(false);
        }
    };

    // 수정 모드 진입 시 기존 데이터 자동 체우기
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
        if (!imageFile) return message.warning('사업자 등록증 이미지를 업로드해주세요');
        setSubmitLoading(true);
        try {
            await businessService.submit({ ...form, licenseImage: imageFile });
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
                    setImageFile(null); setImagePreview(null);
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
                    imageFile={imageFile} imagePreview={imagePreview}
                    fileInputRef={fileInputRef} onFileChange={handleFileChange}
                    onSubmit={handleUpdate} loading={updateLoading}
                    submitLabel="수정 저장"
                />
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
                imageFile={imageFile} imagePreview={imagePreview}
                fileInputRef={fileInputRef} onFileChange={handleFileChange}
                onSubmit={handleSubmit} loading={submitLoading}
            />
        </div>
    );

    // ── 미신청 (기본) ──
    return (
        <BusinessForm
            form={form} setForm={setForm}
            imageFile={imageFile} imagePreview={imagePreview}
            fileInputRef={fileInputRef} onFileChange={handleFileChange}
            onSubmit={handleSubmit} loading={submitLoading}
        />
    );
};

// eslint-disable-next-line no-unused-vars
const BusinessForm = ({ form, setForm, imageFile, imagePreview, fileInputRef, onFileChange, onSubmit, loading, submitLabel = '사업자 인증 신청' }) => (
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

        {/* 이미지 업로드 — 선택 후 Ant Design Image로 클릭 시 전체화면 프리뷰 */}
        <div style={bizStyles.imageUpload(!!imagePreview)}>
            {imagePreview ? (
                <Image
                    src={imagePreview}
                    alt="사업자 등록증"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: radius.lg }}
                    preview={{ mask: '크게 보기' }}
                />
            ) : (
                <div
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%', height: '100%', justifyContent: 'center' }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <UploadOutlined style={{ fontSize: 22, color: colors.text.tertiary }} />
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>사업자 등록증 이미지 업로드 *</Text>
                </div>
            )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />

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
    imageUpload: (hasImage) => ({
        height: hasImage ? 160 : 100,
        border: `2px dashed ${colors.border.default}`,
        borderRadius: radius.lg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', overflow: 'hidden',
        backgroundColor: colors.gray[50],
        transition: 'border-color 0.2s',
    }),
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
                <Tabs defaultActiveKey="name" items={tabItems} className="reserve-pill-tabs" animated={{ inkBar: true, tabPane: false }} />
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
