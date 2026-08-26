/**
 * 새로고침 버튼 — 앱의 모든 "새로고침"이 이걸 쓴다.
 *
 * <h3>왜 컴포넌트로 뽑았나 (2026-08-25)</h3>
 * `<Button><SyncOutlined spin={loading}/> 새로고침</Button>` 이 **네 곳**에 복사돼 있었고
 * (FilterToolbar 2곳, MailboxTab, ChatTab), 그중 셋이 3초 쿨다운을 **각자 다시 구현**하고 있었다.
 * 같은 규칙이 네 벌이면 한 벌만 고쳐지는 건 시간문제다. 이 컴포넌트의 존재 이유는 **쿨다운 통합**이다.
 *
 * <h3>★★ 회전 정지는 손대지 않는다 — 두 번 고쳤다가 두 번 되돌렸다 (2026-08-25)</h3>
 * 증상: `spin` 이 false 가 되면 `.anticon-spin` 클래스가 빠지면서 애니메이션이 그 자리에서 사라지고,
 * `transform` 이 즉시 `none`(0°)이 된다. 137° 쯤에서 멈췄다면 그 각도에서 0° 로 **순간이동**한다.
 * (`@ant-design/icons/lib/utils.js` 의 `loadingCircle 1s infinite linear` — 실측)
 *
 * 시도 ① **한 바퀴를 마저 돌고 멈추기** — `el.getAnimations()[0].currentTime` 으로 남은 시간을 재서
 *   0° 에 닿을 때까지 계속 돌렸다. 튄 각도 86° → 1° 로 각도는 완벽했다.
 *   → **되돌림.** 응답이 80ms 에 와도 버튼이 920ms 를 더 돈다. 표에는 데이터가 이미 떴는데
 *     버튼만 혼자 도니까 **스피너가 로딩 상태에 대해 거짓말**을 한다. 원래 증상보다 나빴다.
 *
 * 시도 ② **아이콘 교체** — `loading ? <LoadingOutlined/> : <SyncOutlined/>`.
 *   모양이 다른 두 아이콘이라 "돌던 게 제자리로 튀는" 장면이 생기지 않는다(AntD Button 이 쓰는 방식).
 *   → **되돌림.** 사용자 평가: *"별로다. 전이랑 차이가 없다."*
 *     원호 스피너가 멈춘 자리에 화살표 아이콘이 나타나는 것도 결국 한 프레임짜리 전환이라,
 *     체감이 달라지지 않았다.
 *
 * ⚠️ 셋 다 재본 결론: **이 각도 튐은 눈에 띄는 값이 아니다.** `SyncOutlined` 는 180° 회전 대칭이라
 * 실제 체감 각도차는 최대 90° 이고, 20px 아이콘에서 한두 프레임이다.
 * 고치려 들면 반드시 **스피너와 데이터가 어긋나거나(①)**, **아무것도 안 달라지거나(②)** 둘 중 하나다.
 * → **`spin={loading}` 그대로 둔다. 회전은 요청 중이라는 뜻이고, 요청이 끝나면 멈춘다. 그게 전부다.**
 *   (검토했다가 기각: 각도가 맞을 때까지 데이터를 스켈레톤으로 붙잡아 두기 — 장식 때문에 콘텐츠를
 *    늦추는 건 순서가 뒤집힌 것이다. 최소 표시 시간 400ms — ① 의 병이 작게 재발한다.)
 *
 * <h3>왜 `disabled={loading}` 만으로 부족했나 (= 쿨다운이 필요한 이유)</h3>
 * 응답이 빠르면 버튼이 곧바로 풀려서 연타가 그대로 요청이 된다. 특히 TanStack Query 의 `refetch()` 는
 * `staleTime` 을 무시하고 **항상** 네트워크를 친다. 기존 구현들은 `setTimeout` 을 **정리하지 않아서**,
 * 쿨다운 도중 화면을 떠나면 사라진 컴포넌트에 setState 가 걸렸다. 여기서는 언마운트 시 정리한다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { SyncOutlined } from '@ant-design/icons';
import Button from './Button';

/** 연타 방지. 한 번 더 눌러볼까 하는 손은 막되, 기다린다는 느낌은 안 드는 선. */
const COOLDOWN_MS = 3000;

const RefreshButton = ({ onReload, loading = false, label = '새로고침', style, ...rest }) => {
    const [cooling, setCooling] = useState(false);
    const coolTimer = useRef(null);

    useEffect(() => () => clearTimeout(coolTimer.current), []);

    const handleClick = useCallback(() => {
        if (!onReload || loading || cooling) return;
        setCooling(true);
        coolTimer.current = setTimeout(() => setCooling(false), COOLDOWN_MS);
        onReload();
    }, [onReload, loading, cooling]);

    if (!onReload) return null;

    return (
        <Button
            variant="ghost-sm"
            size="md"
            onClick={handleClick}
            disabled={loading || cooling}
            style={{ flexShrink: 0, ...style }}
            {...rest}
        >
            <SyncOutlined spin={loading} />
            {label ? ` ${label}` : null}
        </Button>
    );
};

RefreshButton.propTypes = {
    /** 없으면 버튼 자체를 렌더하지 않는다(호출부의 `onReload && <...>` 를 대신한다). */
    onReload: PropTypes.func,
    loading: PropTypes.bool,
    label: PropTypes.string,
    style: PropTypes.object,
};

export default RefreshButton;
