import LoadingStatus from '../../components/common/LoadingStatus';
import LoadingUpload from '../../components/common/LoadingUpload';
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Typography, Form, Upload } from 'antd';
import { ClockCircleOutlined, UploadOutlined } from '../../components/common/icons';
import { Button, DataState, FormInput, Bone } from '../../components/common';
import { useMessage } from '../../hooks';
import { businessService } from '../../services';
import { handleApiError } from '../../utils/errorHandler';
import { IMAGE_ACCEPT, imageFileError } from '../../utils/imageUploadPolicy';
import { SCROLL_TO_FIRST_ERROR } from '../../utils/form';
import useAuthStore from '../../store/useAuthStore';
import useImagePreview from '../../hooks/useImagePreview';
import { colors, radius, fontSize } from '../../styles/tokens';
const { Text } = Typography;
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;


const BusinessTab = ({ user }) => {
    const { message, confirm } = useMessage();
    const [status, setStatus]     = useState(/** @type {string | null} */ (null));
    const [rejectionReason, setRejectionReason] = useState(null);
    const [statusLookup, setStatusLookup] = useState({ scope: /** @type {string | null} */ (null), phase: 'loading' });
    const [form, setForm]         = useState({ businessName: '', businessNumber: '', memo: '' });
    const [licenseList, setLicenseList] = useState([]);
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();
    const [submitLoading, setSubmitLoading] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [resignLoading, setResignLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editState, setEditState] = useState({ scope: /** @type {string | null} */ (null), status: 'idle' });
    const editRequestRef = useRef(/** @type {{ scope: string } | null} */ (null));
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const editScope = `${user?.id ?? user?.email}:${user?.role}:${sessionRevision}`;
    const statusRequestRef = useRef(/** @type {Record<string, never> | null} */ (null));
    const statusLoading = user?.role !== 'BUSINESS'
        && (statusLookup.scope !== editScope || statusLookup.phase === 'loading');
    const statusError = statusLookup.scope === editScope && statusLookup.phase === 'error';
    const editLoading = editState.scope === editScope && editState.status === 'loading';
    const editError = editState.scope === editScope && editState.status === 'error';

    useLayoutEffect(() => () => { editRequestRef.current = null; }, [editScope]);
    useLayoutEffect(() => () => { statusRequestRef.current = null; }, [editScope]);

    const isBusiness = user?.role === 'BUSINESS';

    const loadStatus = useCallback(() => {
        /** @type {Record<string, never>} */
        const request = {};
        statusRequestRef.current = request;
        return businessService.getMyStatus()
            .then(res => {
                if (statusRequestRef.current !== request) return;
                setStatus(res?.status ?? null);
                setRejectionReason(res?.rejectionReason ?? null);
                setStatusLookup({ scope: editScope, phase: 'success' });
            })
            .catch(() => {
                if (statusRequestRef.current !== request) return;
                setStatus(null);
                setStatusLookup({ scope: editScope, phase: 'error' });
            });
    }, [editScope]);

    const retryStatus = () => {
        setStatusLookup({ scope: editScope, phase: 'loading' });
        void loadStatus();
    };

    useEffect(() => {
        if (isBusiness) return;
        void loadStatus();
    }, [isBusiness, loadStatus]);

    // 사업자 등록증도 가게 이미지와 동일한 picture-card Upload + 공유 useImagePreview로 통일.
    // AntD Upload가 fileList/썸네일을 관리하므로 별도 blob URL 관리가 필요 없다.
    const licenseFile = licenseList[0]?.originFileObj ?? null;
    const handleLicenseChange = ({ fileList }) => setLicenseList(fileList);
    const beforeUploadLicense = (file) => {
        const imageError = imageFileError(file, PROFILE_IMAGE_MAX_BYTES);
        if (imageError) { message.error(imageError); return Upload.LIST_IGNORE; }
        return false;
    };

    // 상호명 검사는 BusinessForm 의 Form.Item rules 가 이미 막는다 —
    // onFinish 는 검증을 통과해야만 불리므로 여기서 다시 검사하면 절대 안 걸리는 죽은 코드다.
    // (죽은 검사를 남겨두면 "검증이 여기 있다"고 오해해서 진짜 규칙을 못 찾는다)
    const handleUpdate = async () => {
        setUpdateLoading(true);
        try {
            await businessService.update({ ...form, licenseImage: licenseFile || undefined });
            message.success('수정됐어요.');
            setIsEditing(false);
            setLicenseList([]);
        } catch (err) {
            handleApiError(err, message, '수정에 실패했어요');
        } finally {
            setUpdateLoading(false);
        }
    };

    // 수정 모드 진입 시 기존 데이터 자동 채우기
    const handleStartEdit = async () => {
        if (cancelLoading || editRequestRef.current?.scope === editScope) return;
        const request = { scope: editScope, sessionRevision, memberId: user?.id, role: user?.role };
        editRequestRef.current = request;
        setEditState({ scope: editScope, status: 'loading' });
        const isCurrent = () => {
            const auth = useAuthStore.getState();
            return editRequestRef.current === request
                && auth.sessionRevision === request.sessionRevision
                && auth.user?.id === request.memberId && auth.user?.role === request.role;
        };
        try {
            const current = await businessService.getMyStatus();
            if (!isCurrent()) return;
            // 조회 실패·사라진 신청·불완전 응답으로 빈 수정 폼을 열지 않는다.
            if (current?.status !== 'PENDING'
                || typeof current.businessName !== 'string' || !current.businessName.trim()) {
                throw new Error('Pending business verification is unavailable');
            }
            setForm({
                businessName: current.businessName,
                businessNumber: current.businessNumber || '',
                memo: current.memo || '',
            });
            setEditState({ scope: editScope, status: 'ready' });
            setIsEditing(true);
        } catch {
            if (isCurrent()) setEditState({ scope: editScope, status: 'error' });
        } finally {
            if (isCurrent()) {
                editRequestRef.current = null;
                setEditState(state => state.status === 'loading'
                    ? { scope: editScope, status: 'idle' } : state);
            }
        }
    };

    // 상호명·등록증 검사도 BusinessForm 의 rules / license validator 가 담당한다(위 handleUpdate 주석 참고).
    const handleSubmit = async () => {
        setSubmitLoading(true);
        try {
            await businessService.submit({ ...form, licenseImage: licenseFile });
            message.success('사업자 인증 신청이 완료됐어요. 관리자 승인 후 이용할 수 있어요.');
            setStatus('PENDING');
        } catch (err) {
            handleApiError(err, message, '신청에 실패했어요');
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleCancel = () => {
        confirm({
            title: '신청 취소', content: '사업자 인증 신청을 취소할까요?',
            okText: '취소하기', cancelText: '닫기', okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                // 취소 중 뒤늦게 도착한 프리필이 편집창을 다시 열지 못하게 한다.
                editRequestRef.current = null;
                setEditState({ scope: editScope, status: 'idle' });
                setCancelLoading(true);
                try {
                    await businessService.cancel();
                    message.success('신청이 취소됐어요');
                    setStatus(null);
                    setForm({ businessName: '', businessNumber: '', memo: '' });
                    setLicenseList([]);
                } catch (err) {
                    handleApiError(err, message, '취소에 실패했어요');
                } finally {
                    setCancelLoading(false);
                }
            },
        });
    };

    const handleResign = () => {
        confirm({
            title: '사업자 자격 포기',
            content: '사업자 자격을 포기하면 가게 관리와 예약 문의를 받을 수 없어요. 포기할까요?',
            okText: '포기하기', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                setResignLoading(true);
                try {
                    await businessService.resign();
                    await useAuthStore.getState().checkAuth(true);
                    message.success('사업자 자격이 포기됐어요');
                } catch (err) {
                    handleApiError(err, message, '처리에 실패했어요');
                } finally {
                    setResignLoading(false);
                }
            },
        });
    };

    if (statusLoading) return (
        <LoadingStatus aria-label="사업자 인증 상태를 불러오는 중" aria-busy="true">
            <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Bone height={36} borderRadius={radius.lg} />
                <Bone height={44} borderRadius={radius.lg} />
                <Bone height={44} borderRadius={radius.lg} />
                <Bone height={44} borderRadius={radius.lg} />
                <Bone height={100} borderRadius={radius.lg} />
                <Bone height={46} borderRadius={radius.xl} />
            </div>
        </LoadingStatus>
    );

    if (statusError && !isBusiness) return <DataState state="error" kind="member"
        title="사업자 인증 상태를 불러오지 못했어요."
        description="신청 상태를 확인한 뒤 인증 신청을 진행할 수 있어요."
        onRetry={retryStatus} />;

    // ── 사업자 이미 완료 ──
    if (isBusiness) return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={bizStyles.statusCard('success')}>
                <div>
                    <Text strong style={{ color: colors.text.primary, display: 'block', marginBottom: 2 }}>파트너 사장님으로 활동 중이에요</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>가게 등록 및 예약 관리 기능을 이용할 수 있어요</Text>
                </div>
            </div>
            <div style={bizStyles.resignSection}>
                <div>
                    <Text strong style={{ fontSize: fontSize.sm, color: colors.error.main }}>사업자 자격 포기</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: fontSize.xs, marginTop: 2 }}>
                        포기 시 가게 관리 기능을 더 이상 이용할 수 없어요
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
        if (isEditing && editState.scope === editScope && editState.status === 'ready') return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={bizStyles.statusCard('warning')}>
                    <ClockCircleOutlined style={{ fontSize: 20, color: colors.warning.main }} />
                    <div>
                        <Text strong style={{ color: colors.text.primary, display: 'block', marginBottom: 2 }}>신청 내용 수정</Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>수정 후 저장하면 기존 신청이 업데이트돼요</Text>
                    </div>
                </div>
                <BusinessForm
                    form={form} setForm={setForm}
                    fileList={licenseList} onFileListChange={handleLicenseChange}
                    onPreview={handlePreview} onPreviewClickCapture={suppressLinkNavigation}
                    beforeUpload={beforeUploadLicense}
                    onSubmit={handleUpdate} loading={updateLoading}
                    submitLabel="수정 저장"
                    onCancel={() => setIsEditing(false)}
                />
                {previewNode}
            </div>
        );

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={bizStyles.statusCard('warning')}>
                    <ClockCircleOutlined style={{ fontSize: 20, color: colors.warning.main }} />
                    <div>
                        <Text strong style={{ color: colors.text.primary, display: 'block', marginBottom: 2 }}>심사 중이에요</Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>관리자 검토 후 승인 여부를 알려드려요</Text>
                    </div>
                </div>
                {editLoading && <div aria-busy="true">
                    <output aria-label="사업자 신청 내용을 불러오는 중">기존 신청 내용을 확인하고 있어요.</output>
                </div>}
                {editError && <DataState state="error" kind="member"
                    title="사업자 신청 내용을 불러오지 못했어요."
                    description="기존 신청은 변경되지 않았어요. 다시 확인한 뒤 수정할 수 있어요."
                    onRetry={handleStartEdit} compact />}
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" loading={cancelLoading} onClick={handleCancel} style={{ flex: 1 }}>신청 취소</Button>
                    <Button variant="primary" loading={editLoading} disabled={cancelLoading} onClick={handleStartEdit} style={{ flex: 1 }}>수정하기</Button>
                </div>
            </div>
        );
    }

    // ── 거절됨 ──
    if (status === 'REJECTED') return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={bizStyles.statusCard('error')}>
                <div>
                    <Text strong style={{ color: colors.text.primary, display: 'block', marginBottom: 2 }}>인증이 거절됐어요</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>내용을 수정하여 다시 신청할 수 있어요</Text>
                </div>
            </div>
            {status === 'REJECTED' && rejectionReason && (
                <div style={{
                    background: colors.error.light, border: `1px solid ${colors.error.main}`,
                    borderRadius: radius.lg, padding: '12px 14px'
                }}>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary, display: 'block', marginBottom: 4 }}>거절 사유</Text>
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
            {previewNode}
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
            {previewNode}
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
const BusinessForm = ({ form, setForm, fileList, onFileListChange, onPreview, onPreviewClickCapture, beforeUpload, onSubmit, loading, submitLabel = '사업자 인증 신청', licenseRequired = false, onCancel }) => {
    const [antdForm] = Form.useForm();

    return (
        <Form
            form={antdForm}
            layout="vertical"
            requiredMark={false}
            size="large"
            scrollToFirstError={SCROLL_TO_FIRST_ERROR}
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
                <LoadingUpload
                    listType="picture-card"
                    fileList={fileList}
                    onChange={onFileListChange}
                    onPreview={onPreview}
                    onClickCapture={onPreviewClickCapture}
                    beforeUpload={beforeUpload}
                    accept={IMAGE_ACCEPT}
                    maxCount={1}
                >
                    {fileList.length === 0 && (
                        <div>
                            <UploadOutlined style={{ fontSize: 20, color: colors.text.tertiary }} />
                            <div style={{ marginTop: 8, fontSize: fontSize.xs, color: colors.text.tertiary }}>사업자 등록증 *</div>
                        </div>
                    )}
                </LoadingUpload>
            </Form.Item>

            {/* Button 은 우리 공용 컴포넌트라 htmlType 을 전달하지 않는다 → submit() 을 직접 호출한다. */}
            {/* 취소가 있는 수정 모드는 [취소 | 저장] 한 줄 — 이 파일의 사진 변경·심사 중 버튼과 같은 배치다.
                세로로 쌓으면 두 버튼이 같은 무게로 보이고 저장 버튼이 폼 안, 취소가 폼 밖으로 갈라진다. */}
            {onCancel ? (
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="outline" onClick={onCancel} disabled={loading} style={{ flex: 1 }}>취소</Button>
                    <Button variant="primary" loading={loading} onClick={() => antdForm.submit()} style={{ flex: 1 }}>{submitLabel}</Button>
                </div>
            ) : (
                <Button variant="primary" loading={loading} onClick={() => antdForm.submit()} block>{submitLabel}</Button>
            )}
        </Form>
    );
};

// 상태 카드 배경색: success·warning 외에는 error 톤.
const statusCardBackground = (type) => {
    if (type === 'success') return colors.success.light;
    if (type === 'warning') return colors.warning.light;
    return colors.error.light;
};

const bizStyles = {
    statusCard: (type) => ({
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '16px',
        backgroundColor: statusCardBackground(type),
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

export default BusinessTab;
