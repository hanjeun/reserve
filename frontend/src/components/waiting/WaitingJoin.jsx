import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Checkbox } from 'antd';
import { Button, FormModal, FormField, FormInput } from '../common';
import StoreActionPanel from '../store/StoreActionPanel';
import TextLink from '../common/TextLink';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import waitingService from '../../services/waitingService';
import { pathFromLocation, saveRedirect } from '../../utils/redirect';

function WaitingJoinForm({ store, preview, isPC }) {
    const location = useLocation();
    const navigate = useNavigate();
    const client = useQueryClient();
    const { message } = useMessage();
    const revision = useAuthStore(state => state.sessionRevision);
    const loggedIn = useAuthStore(state => state.isLoggedIn);
    const termsNotAgreed = useAuthStore(state => state.user?.termsAgreed) === false;
    const [open, setOpen] = useState(false);
    const [partySize, setPartySize] = useState(1);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [privacyError, setPrivacyError] = useState('');
    const [agreedNotice, setAgreedNotice] = useState(null);
    const policyQuery = useQuery({ queryKey: ['public', 'waitingRetentionPolicy'], queryFn: waitingService.getRetentionPolicy,
        enabled: open && !preview, staleTime: 0, retry: false });
    const policy = policyQuery.data;
    const policyReady = policy?.intakeReady === true && policy?.noticePublishedAt
        && Number.isFinite(Date.parse(policy.noticePublishedAt)) && !policyQuery.isFetching && !policyQuery.isError;
    const privacyAgreed = Boolean(policyReady && agreedNotice === policy.noticePublishedAt);
    const requestId = useRef(null);
    const operation = useRef(null);
    const alive = useRef(false);
    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; operation.current?.abort(); };
    }, []);
    const mode = store.waitingIntakeMode || 'OFF';
    const onsiteToken = preview ? null : new URLSearchParams(location.hash.slice(1)).get('waiting-token');
    const remote = mode === 'REMOTE' || mode === 'BOTH';
    const onsite = mode === 'ONSITE' || mode === 'BOTH';
    const onsiteEntry = onsite && Boolean(onsiteToken);
    const paused = store.waitingPaused === true;
    const allowed = !paused && (remote || onsiteEntry);
    if (mode === 'OFF') return null;
    const goToLogin = () => {
        if (!preview && !operation.current) {
            saveRedirect(pathFromLocation(location));
            navigate('/login', { state: { from: location } });
        }
    };
    const start = () => {
        if (preview || !allowed || operation.current) return;
        if (!loggedIn) { goToLogin(); return; }
        if (termsNotAgreed) {
            saveRedirect(pathFromLocation(location));
            navigate('/signup/social', { replace: true });
            return;
        }
        setError(''); setPrivacyError(''); setAgreedNotice(null); setOpen(true);
    };
    const submit = async () => {
        if (preview || operation.current || !loggedIn || termsNotAgreed) return;
        if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) { setError('인원은 1명부터 100명까지 입력해주세요.'); return; }
        if (!privacyAgreed) { setPrivacyError('접수 안내를 확인하고 개인정보 제공에 동의해주세요.'); return; }
        const controller = new AbortController();
        operation.current = controller;
        requestId.current ??= crypto.randomUUID();
        setPending(true); setError('');
        const current = () => alive.current && revision === useAuthStore.getState().sessionRevision;
        try {
            await waitingService.join(store.id, { partySize, clientRequestId: requestId.current,
                onsiteToken: onsite && onsiteToken ? onsiteToken : undefined, privacyAgreed: true,
                privacyNoticePublishedAt: policy.noticePublishedAt }, controller.signal);
            if (!current()) return;
            void client.invalidateQueries({ queryKey: ['waiting', revision] });
            setOpen(false); requestId.current = null;
            message.success('웨이팅을 접수했어요. 내 예약에서 확인해주세요.');
            // 토큰은 다음 화면의 주소나 방문 기록에 더 전파하지 않는다.
            navigate('/my-reservations?tab=waiting', { replace: Boolean(onsiteToken) });
        } catch (failure) {
            if (current() && !controller.signal.aborted && !failure?.isStaleSession) setError(failure?.message || '접수하지 못했어요. 다시 시도해주세요.');
        } finally {
            if (operation.current === controller) operation.current = null;
            if (current()) setPending(false);
        }
    };
    const intakeGuide = onsiteEntry ? {
        title: '현장 QR로 접수를 시작해요',
        description: '아래 버튼에서 현장 접수를 진행해요. 가입 후 다른 화면으로 이동했다면 가게의 현장 접수 QR을 다시 스캔해주세요.',
    } : remote && onsite ? {
        title: '원격 또는 현장에서 접수해요',
        description: '방문 전에는 아래 버튼으로 원격 접수하고, 가게에 도착했다면 현장 접수 QR을 스캔해 접수할 수 있어요.',
    } : onsite ? {
        title: '가게에서 현장 QR을 스캔해요',
        description: '가게에 도착해 안내된 현장 접수 QR을 휴대폰 카메라로 스캔해주세요. QR을 스캔하는 것만으로 접수되지는 않아요.',
    } : {
        title: '방문 전에 원격 접수해요',
        description: '아래 버튼에서 웨이팅을 접수할 수 있어요. 예약 시간을 선택하는 대신 대기 번호를 받고 호출을 기다려요.',
    };
    const joinClassName = `reserve-waiting-join${store.reservationEnabled !== false ? ' reserve-waiting-join--after-reservation' : ''}`;
    return <section className={joinClassName} aria-label="가게 웨이팅 접수">
        <StoreActionPanel title="웨이팅 접수 안내" isPC={isPC}>
            <p className="reserve-waiting-join-lead">{remote && onsite ? '현장 QR과 원격 접수를 모두 이용할 수 있어요.'
                : onsite ? '가게에 도착한 뒤 현장 QR로 대기 번호를 받아요.' : '방문 전에 원격으로 대기 번호를 받아요.'}</p>
            {paused && <p className="reserve-waiting-join-status" role="status">웨이팅 접수가 잠시 중지돼 있어요. 기존 대기는 유지되고 호출·입장 안내를 확인할 수 있어요.</p>}
            <ol className="reserve-waiting-join-steps" aria-label="웨이팅 이용 순서">
                <li><div><strong>회원가입·로그인해요</strong>
                    <p>앱에서 접수하려면 로그인이 필요해요. 계정이 없다면 먼저 회원가입해주세요.</p></div></li>
                <li><div><strong>{intakeGuide.title}</strong><p>{intakeGuide.description}</p></div></li>
                <li><div><strong>인원과 동의를 확인해요</strong>
                    <p>함께 입장할 인원을 입력하고 개인정보 제공에 동의한 뒤, 접수하기를 눌러주세요. 접수가 완료되면 대기 번호가 생겨요.</p></div></li>
                <li><div><strong>내 예약에서 순서를 확인해요</strong>
                    <p>내 예약의 웨이팅에서 앞에 남은 팀과 호출 상태를 확인해요. 호출되면 입장 QR을 직원에게 보여주세요. 방문이 어렵다면 접수를 취소할 수 있어요.</p></div></li>
            </ol>
            <div className="reserve-waiting-join-actions">
                {allowed && <Button variant="primary" block onClick={start} disabled={preview || pending}>
                    {loggedIn ? termsNotAgreed ? '이용 동의하고 접수' : '웨이팅 접수' : '로그인하고 접수'}
                </Button>}
                {!paused && !allowed && !loggedIn && <Button variant="primary" block onClick={goToLogin} disabled={preview}>로그인하기</Button>}
                {loggedIn && !preview && <TextLink to="/my-reservations?tab=waiting" className="reserve-waiting-my-link">내 웨이팅 확인</TextLink>}
            </div>
        </StoreActionPanel>
        <FormModal title={`${store.name} 웨이팅`} open={open} onClose={() => { if (!operation.current) setOpen(false); }}
            onSubmit={submit} submitting={pending} submitDisabled={!privacyAgreed} submitText="접수하기" width={440} mobileSize="content">
            <p className="reserve-waiting-form-help">{store.name} 운영자에게 회원 이름, 인원, 접수 번호·상태와 처리 시각을 제공해요. 웨이팅 접수·호출·입장 관리에 사용하며, 연락처와 회원 식별자는 명단에 표시하지 않아요.</p>
            <p className="reserve-waiting-form-help">진행 접수는 처리할 때까지 보관해요. 입장·취소 후 다음 한국 시간 날짜에 이름과 회원 연결을 지우고, 종료 접수 기록은 7일 후 파기해요. 개인정보 제공에 동의하지 않을 수 있으며, 동의하지 않으면 앱에서 웨이팅을 접수할 수 없어요.</p>
            <p className="reserve-waiting-form-help"><TextLink to="/privacy" target="_blank" rel="noopener noreferrer">개인정보 처리방침</TextLink></p>
            {policyQuery.isFetching ? <p className="reserve-waiting-form-help" role="status">접수 안내를 불러오는 중이에요.</p>
                : !policyReady && <FormField error={policyQuery.isError ? '접수 안내를 불러오지 못했어요.' : '웨이팅 접수를 준비 중이에요. 잠시 후 다시 이용해주세요.'}>
                    <Button variant="outline" size="sm" onClick={() => { void policyQuery.refetch(); }}>다시 시도</Button>
                </FormField>}
            <FormField error={privacyError}>
                <Checkbox checked={privacyAgreed} disabled={pending || !policyReady}
                    onChange={event => { setAgreedNotice(event.target.checked ? policy.noticePublishedAt : null); setPrivacyError(''); }}>
                    가게에 개인정보 제공 동의
                </Checkbox>
            </FormField>
            <FormField label="인원" error={error}>
                <FormInput type="number" aria-label="웨이팅 접수 인원" min={1} max={100} precision={0} suffix="명"
                    value={partySize} disabled={pending} onChange={value => { setPartySize(value); requestId.current = null; setError(''); }} />
            </FormField>
        </FormModal>
    </section>;
}
WaitingJoinForm.propTypes = { store: PropTypes.object.isRequired, preview: PropTypes.bool, isPC: PropTypes.bool };

export default function WaitingJoin({ store, preview = false, isPC = false }) {
    const revision = useAuthStore(state => state.sessionRevision);
    return <WaitingJoinForm key={`${store.id}:${revision}`} store={store} preview={preview} isPC={isPC} />;
}
WaitingJoin.propTypes = { store: PropTypes.object.isRequired, preview: PropTypes.bool, isPC: PropTypes.bool };
