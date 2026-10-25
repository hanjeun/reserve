import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import searchService from '../../services/searchService';
import ReservationDetailModal from '../../components/reservation/ReservationDetailModal';
import WaitingDetailModal from '../../components/waiting/WaitingDetailModal';
import DataState from '../../components/common/DataState';
import LoadingStatus from '../../components/common/LoadingStatus';
import Bone from '../../components/common/Bone';
import UnderlinedTextButton from '../../components/common/UnderlinedTextButton';
import { canSearchPersonal } from '../../constants/searchCatalog';
import { positiveSearchId } from '../../utils/searchResults';
import { StaleSessionError } from '../../api/sessionScope';
import { httpStatusOf } from '../../utils/listErrorMessage';

const targetOf = params => {
    const reservation = params.get('reservationId');
    const waiting = params.get('entryId');
    if (reservation == null && waiting == null) return null;
    const kind = waiting != null ? 'waiting' : 'reservation';
    const id = positiveSearchId(waiting ?? reservation);
    const token = `${reservation}:${waiting}`;
    return { token, kind, id: id && !(reservation != null && waiting != null)
        && params.getAll('reservationId').length <= 1 && params.getAll('entryId').length <= 1
        && (kind !== 'waiting' || params.get('tab') === 'waiting') ? id : null };
};

/* 검색 목적지는 한 번 쓰는 힌트이며 본인 상세 조회가 권한 관문이다. */
function PersonalSearchHandoffBody() {
    const [params, setParams] = useSearchParams();
    const target = targetOf(params);
    const auth = useAuthStore();
    const capture = value => value ? { ...value, ownerId: auth.user?.id, revision: auth.sessionRevision } : null;
    const [request, setRequest] = useState(() => capture(target));
    const [closed, setClosed] = useState(false);
    const consumed = useRef(null);
    if (target && target.token !== request?.token) {
        setRequest(capture(target)); setClosed(false);
    }
    const id = auth.user?.id;
    const revision = auth.sessionRevision;
    const allowed = canSearchPersonal(auth) && request?.ownerId === id && request?.revision === revision;
    const client = useQueryClient();
    const scope = ['search-handoff', id, revision];
    const query = useQuery({
        queryKey: [...scope, request?.kind, request?.id, allowed],
        enabled: allowed && !closed && request?.id != null,
        queryFn: async ({ signal }) => {
            const current = () => {
                const latest = useAuthStore.getState();
                return canSearchPersonal(latest) && latest.user.id === id && latest.sessionRevision === revision;
            };
            if (!current()) throw new StaleSessionError();
            const data = await searchService[request.kind](request.id, signal);
            if (!current()) throw new StaleSessionError();
            const correct = request.kind === 'reservation' ? data?.id === request.id && data.memberId === id : data?.entry?.id === request.id;
            if (!correct) throw new Error('선택한 항목의 응답을 확인할 수 없어요.');
            return { data, id, revision };
        },
        gcTime: 0, staleTime: 0,
        retry: (count, error) => !error?.isStaleSession && count < 1 && !(httpStatusOf(error) >= 400 && httpStatusOf(error) < 500),
        refetchOnWindowFocus: false,
        meta: { sensitive: true },
    });
    const token = target?.token;
    useEffect(() => {
        if (!token || consumed.current === token) return;
        consumed.current = token;
        setParams(current => {
            const next = new URLSearchParams(current);
            next.delete('reservationId'); next.delete('entryId');
            return next;
        }, { replace: true });
    }, [token, setParams]);
    useEffect(() => () => {
        const queryKey = ['search-handoff', id, revision];
        void client.cancelQueries({ queryKey });
        client.removeQueries({ queryKey });
    }, [client, id, revision]);
    if (!allowed || !request) return null;
    const denied = [401, 403, 404, 410].includes(httpStatusOf(query.error)) || query.error?.isStaleSession;
    const data = !denied && query.data?.id === id && query.data?.revision === revision ? query.data.data : null;
    const close = () => {
        void client.cancelQueries({ queryKey: ['search-handoff', id, revision, request.kind, request.id] });
        setClosed(true);
    };
    if (closed && !data) return null;
    if (!closed && (!request.id || query.isError)) return <div>
        <DataState state="error" compact subject="선택한 검색 항목" error={query.error}
            title={!request.id ? '검색 항목의 주소를 확인해주세요.' : undefined}
            onRetry={request.id ? query.refetch : undefined} retrying={query.isFetching} />
        <UnderlinedTextButton onClick={close}>검색 항목 닫기</UnderlinedTextButton>
    </div>;
    if (!data) return <LoadingStatus aria-label="선택한 검색 항목 확인 중" aria-busy="true"><Bone width="65%" height={14} pageLoading={false} /></LoadingStatus>;
    return request.kind === 'reservation'
        ? <ReservationDetailModal reservation={data} open={!closed} onClose={close} />
        : <WaitingDetailModal detail={data} open={!closed} onClose={close} />;
}

// 명시적 검색 힌트가 있을 때만 추가 상세 관찰자를 붙인다.
export default function PersonalSearchHandoff() {
    const [params] = useSearchParams();
    const requested = params.has('reservationId') || params.has('entryId');
    const [active, setActive] = useState(requested);
    if (requested && !active) setActive(true);
    return active ? <PersonalSearchHandoffBody /> : null;
}
