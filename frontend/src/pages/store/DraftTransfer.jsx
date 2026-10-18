import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from 'antd';
import { Button, DataState, PageContainer, PageDescription, PageTitle } from '../../components/common';
import StateIllustration from '../../components/common/StateIllustration';
import useAuthStore from '../../store/useAuthStore';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useMessage from '../../hooks/useMessage';
import { listStoreDrafts } from '../../utils/storeDraftStorage';
import { exportStoreDraftArchive, parseStoreDraftArchive, restoreStoreDraftArchive } from '../../utils/storeDraftArchive';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import { APP_ORIGIN, LEGACY_ORIGIN, appUrl } from '../../config/siteUrls';
import DraftTransferSkeleton from '../../components/store/DraftTransferSkeleton';

export default function DraftTransfer() {
    const memberId = useAuthStore(state => state.user?.id);
    const revision = useAuthStore(state => state.sessionRevision);
    return <DraftTransferSession key={memberId + ':' + revision} />;
}

function DraftTransferSession() {
    useDocumentTitle('가게 초안 옮기기');
    const user = useAuthStore(state => state.user);
    const { message } = useMessage();
    const [records, setRecords] = useState(null);
    const [selected, setSelected] = useState([]);
    const [incoming, setIncoming] = useState(null);
    const [overwrite, setOverwrite] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const chooser = useRef(null);
    const lock = useRef(false);
    const generation = useRef(0);
    const refresh = async (session = currentSession().epoch) => {
        const drafts = await listStoreDrafts(user.id); assertCurrentSession(session);
        setRecords(drafts); setSelected(drafts.map(record => record.key));
    };
    useEffect(() => {
        const session = currentSession().epoch;
        const stamp = ++generation.current;
        void listStoreDrafts(user.id).then(drafts => { if (isCurrentSession(session) && generation.current === stamp) { setRecords(drafts); setSelected(drafts.map(record => record.key)); } })
            .catch(failure => { if (isCurrentSession(session) && generation.current === stamp) setError(failure.message); });
        return () => { generation.current += 1; };
    }, [user.id]);
    const work = async action => {
        if (lock.current) return;
        const session = currentSession().epoch; const stamp = generation.current;
        const ticket = {}; lock.current = ticket; setBusy(true); setError('');
        try { await action(session); }
        catch (failure) { if (!failure.isStaleSession && isCurrentSession(session) && generation.current === stamp) setError(failure.message); }
        finally { if (lock.current === ticket) lock.current = false; if (generation.current === stamp) setBusy(false); }
    };
    const exportSelected = () => work(async session => {
        const blob = await exportStoreDraftArchive(user.id, selected, session);
        const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `reserve-store-drafts-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const chooseFile = event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        void work(async session => {
            const parsed = await parseStoreDraftArchive(file, user.id, session); assertCurrentSession(session);
            setIncoming(parsed); setOverwrite(false);
        });
    };
    const restore = () => work(async session => {
        await restoreStoreDraftArchive(incoming, overwrite, session); setIncoming(null); await refresh(session);
        message.success('임시저장을 가져왔어요. 가게 등록·수정 화면에서 확인해주세요.');
    });
    if (!records && !error) return <DraftTransferSkeleton />;
    const legacy = window.location.origin === LEGACY_ORIGIN && APP_ORIGIN !== LEGACY_ORIGIN;
    return <PageContainer size="md">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <StateIllustration name="draft-transfer" size="sm" interactive={false} />
            <PageTitle style={{ margin: 0 }}>가게 초안 옮기기</PageTitle>
        </div>
        <PageDescription>가게 등록·수정 중 저장한 내용과 사진을 새 앱 주소로 옮겨요.</PageDescription>
        <p className="reserve-feed-note">기존 주소에서 파일을 내보내고, 새 앱에서 같은 계정으로 로그인해 가져오세요.</p>
        {legacy && <p><a className="reserve-feed-text-link" href={appUrl('/drafts/transfer')}>새 앱에서 가져오기</a></p>}
        <div className="reserve-feed-editor-actions"><Button variant="outline" size="sm" onClick={exportSelected} disabled={busy || !selected.length}>선택한 초안 내보내기</Button>
            <Button size="sm" onClick={() => chooser.current?.click()} disabled={busy}>파일 가져오기</Button></div>
        <input ref={chooser} className="reserve-feed-file-input" type="file" accept="application/json,.json" onChange={chooseFile} disabled={busy} aria-label="임시저장 파일 가져오기" />
        {error && <p className="reserve-field-error" role="alert">{error}</p>}
        {records?.length ? <ul className="reserve-feed-report-list">
            {records.map(record => <li key={record.key}><Checkbox disabled={busy} checked={selected.includes(record.key)} onChange={event => setSelected(current => event.target.checked ? [...current, record.key] : current.filter(key => key !== record.key))}>
                {record.values.name || '새 가게 초안'} · {new Date(record.savedAt).toLocaleString('ko-KR')}</Checkbox>
                <Link to={record.key.endsWith(':new') ? '/store/register' : `/store/${record.key.split(':').at(-1)}/edit`}>작성 계속하기</Link></li>)}</ul>
            : <DataState state="empty" title="이 주소에 저장한 가게 초안이 없어요." />}
        {incoming && <div className="reserve-store-news-manage-row"><h2>가져올 초안 {incoming.length}개</h2>
            <p className="reserve-feed-note">이름·사진 순서·예약 설정을 복원해요. 가게 수정 초안은 현재 서버 정보와 달라졌는지 기존 복원 화면에서 다시 확인해요.</p>
            <Checkbox checked={overwrite} onChange={event => setOverwrite(event.target.checked)} disabled={busy}>같은 가게의 기존 초안도 덮어쓰기</Checkbox>
            <div className="reserve-feed-editor-actions"><Button variant="outline" size="sm" onClick={() => setIncoming(null)} disabled={busy}>취소</Button>
                <Button size="sm" onClick={restore} loading={busy} disabled={!incoming.length}>가져오기</Button></div></div>}
        {APP_ORIGIN !== LEGACY_ORIGIN && !legacy && <p><a className="reserve-feed-text-link" href={`${LEGACY_ORIGIN}/drafts/transfer`}>기존 주소의 임시저장 확인</a></p>}
    </PageContainer>;
}
