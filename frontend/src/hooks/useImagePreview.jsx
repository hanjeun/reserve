import { useState, useCallback, useRef, useEffect } from 'react';
import ImagePreviewPortal from '../components/common/ImagePreviewPortal';

/**
 * Upload 컴포넌트의 이미지 미리보기 훅
 * (가게 등록 / 가게 수정 / 광고 관리 / 마이페이지 사업자등록증 — 이 훅을 쓰는 곳 전부 동일하게 적용됨)
 *
 * Image.PreviewGroup + items 방식 (AntD v5+)
 *   → 소스 이미지가 화면에 없어도 AntD PreviewGroup 자체 애니메이션(fade+scale) 적용됨
 *
 * ── 2026-07 여러 장 넘겨보기 지원 ────────────────────────────────────────────
 * 예전엔 handlePreview(file) 하나만 받아서 items=[클릭한 1장]으로 고정 → 프리뷰가 항상 1/1이라
 * 상세페이지(<Image preview>)처럼 좌우로 넘길 수가 없었다. 이제 handlePreview(file, fileList)로
 * 그 Upload의 전체 목록을 함께 받아, 목록 전체를 items로 넣고 클릭한 이미지를 current 인덱스로
 * 시작한다(fileList가 없으면 클릭한 1장만 — 대표 이미지처럼 1장짜리 Upload는 그대로 동작).
 *
 * ── blob URL 수명 관리 ──────────────────────────────────────────────────────
 * 목록에 아직 업로드 전(originFileObj) 파일이 섞여 있으면 그 항목은 blob URL을 만들어 미리보기한다.
 * 이미 서버에 있는 파일(file.url = S3/CloudFront)은 그대로 쓴다(해제 대상 아님). 프리뷰를 열 때
 * 만든 blob들을 배열로 들고 있다가, 닫힘 애니메이션이 끝난 뒤 한꺼번에 정리한다.
 *
 * ── 닫힘 애니메이션 ──────────────────────────────────────────────────────────
 * visible=false만 먼저 내리고, 실제 정리(목록 비우기 + blob revoke)는 EXIT_DURATION 뒤로 미룬다 —
 * 그래야 AntD가 닫힘 트랜지션을 재생할 DOM이 남는다. 애니메이션 도중 다시 열면 타이머를 취소한다.
 *
 * ── ★★ 2026-08-25 구조 변경 — 렌더 중 ref 변경 제거 ─────────────────────────
 * **증상**: "처음 미리보기를 열 때만 확대 애니메이션이 씹힌다." 여러 세션 동안 못 잡던 문제다.
 *
 * 2026-07-28 브라우저 계측이 남긴 결론(메모리 `reserve-image-preview-motion-race`):
 *
 *   - 보이는 모션은 root의 opacity가 아니라 `.ant-image-preview-body`의 `transform` scale(0→1)
 *   - 씹힘 = `-body`가 scale(0)에 멈췄다가 ~130ms에 `transform: none`으로 **최종 상태로 순간이동**
 *   - rc-motion의 `-appear-start` 직후 `cancelNextFrame`은 성공·실패 양쪽 다 일어난다.
 *     차이는 **실패할 때만 재예약이 없다** — 체인이 끊겨 `-appear-active`가 영영 안 붙는다
 *   - 취소 후 재예약이 없는 경로는 rc-motion의 **effect cleanup** 하나뿐인데 DOM 변화는 0건이었다
 *     → **React가 렌더를 버리고 다시 렌더한 것**으로 결론
 *
 * 그 "버려지는 렌더"를 만들 수 있는 자리가 이 파일에 있었다 — **렌더 도중 ref를 바꾸는 3줄**:
 *
 *     previewOpenRef.current = previewOpen;      // eslint-disable react-hooks/refs
 *     previewItemsRef.current = previewItems;
 *     previewCurrentRef.current = previewCurrent;
 *
 * React 19 concurrent 렌더링에서 렌더 중 ref 변경은 안전하지 않다 —
 * **버려진 렌더가 쓴 값이 ref에 남는다.** PreviewModal이 그 ref로 `visible`을 읽었으므로
 * 상태가 한 번 더 요동칠 수 있었다.
 *
 * 왜 그런 우회를 했었나 — `PreviewModal`을 훅 **안에서** 만들다 보니 참조를 고정해야 했고
 * (참조가 바뀌면 소비 측이 자식 트리를 remount해서 닫힘 트랜지션이 묻힌다),
 * 고정하면 클로저가 첫 렌더의 state를 붙잡아서 최신 값을 ref로 우회해 읽을 수밖에 없었다.
 *
 * **지금은 그 제약 자체가 없다.** 컴포넌트를 모듈 레벨(`ImagePreviewPortal`)로 빼면
 * 타입 identity가 영원히 고정되므로 remount가 애초에 일어나지 않고, 값은 **props로 그냥 넘긴다.**
 * 훅은 컴포넌트가 아니라 **완성된 엘리먼트(`previewNode`)** 를 돌려준다.
 *
 * ⚠️ 증상이 **간헐적**이라(계측 당시 실패율 3/6 ~ 3/8) 여기서 "고쳤다"고 단정할 수 없다.
 *    검증은 하드 리프레시 후 **맨 처음 클릭**을 여러 번, 그리고 `document.visibilityState`가
 *    'visible'인 상태에서 해야 한다(백그라운드 탭이면 rAF가 멈춰 계측이 전부 거짓이 된다).
 *
 * 이미 반증된 가설 두 개는 **다시 시도하지 말 것** — ① 이미지 디코딩 지연(64×64에서도 재현)
 * ② key remount 제거(실패율 차이 없음).
 *
 * ── 툴바 ────────────────────────────────────────────────────────────────────
 * AntD 기본 프리뷰 툴바는 우리 톤과 이질적이라, index.css에서 .reserve-image-preview 규칙으로
 * 툴바를 우리 디자인 시스템 톤(평소엔 아이콘만, hover 시에만 둥근 박스)으로 맞춘다.
 */

// AntD Image preview의 닫힘 트랜지션(zoom/fade) 재생 시간. 여유를 조금 둠.
const EXIT_DURATION = 300;

// blob URL 해제 공통 헬퍼 — blob이 아닌 URL(S3/CloudFront)은 해제 대상이 아니다.
const revokeIfBlob = (url) => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
};

// AntD Upload file → 미리보기 URL. 업로드 전(originFileObj) 파일은 blob 생성.
const fileToUrl = (file) => {
    if (file.url) return { url: file.url, isBlob: false };
    if (file.preview) return { url: file.preview, isBlob: false };
    if (file.originFileObj) return { url: URL.createObjectURL(file.originFileObj), isBlob: true };
    return null;
};

const useImagePreview = () => {
    const [previewOpen, setPreviewOpen] = useState(false);
    // 프리뷰에 넘길 이미지 URL 배열 + 시작 인덱스
    const [previewItems, setPreviewItems] = useState([]);
    const [previewCurrent, setPreviewCurrent] = useState(0);
    /*
     * 프리뷰를 열 때마다 1씩 증가하는 세션 번호 — PreviewGroup의 key로 쓴다.
     * ref가 아니라 state인 이유: key는 **렌더 결과에 쓰이는 값**이라 ref로 두면 렌더 중 ref를
     * 읽는 셈이 된다(위 클래스 주석의 그 함정과 같은 부류). 여는 이벤트 안에서 setPreviewOpen과
     * 함께 갱신되므로 React가 한 번의 렌더로 묶는다 — 렌더가 늘지 않는다.
     */
    const [previewSession, setPreviewSession] = useState(0);
    const exitTimerRef = useRef(null);
    // 현재 화면에 띄우고 있는 blob URL들 — 언마운트/닫힘 cleanup에서 해제해야 하므로 ref로 보관
    // (클로저가 캡쳐한 시점의 state가 아니라 최신 값을 봐야 한다).
    const activeBlobsRef = useRef([]);

    // blob URL 일괄 해제 — activeBlobsRef(ref)만 참조하므로 안정적(useCallback deps 비움).
    const revokeAllBlobs = useCallback(() => {
        activeBlobsRef.current.forEach(revokeIfBlob);
        activeBlobsRef.current = [];
    }, []);

    // 언마운트 시: 예약된 정리 타이머 취소 + 남아있는 blob URL 해제.
    useEffect(() => () => {
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        revokeAllBlobs();
    }, [revokeAllBlobs]);

    /**
     * @param file     클릭한 파일(AntD Upload onPreview가 넘겨주는 것)
     * @param fileList 그 Upload의 전체 목록(선택) — 있으면 여러 장 넘겨보기, 없으면 클릭한 1장만
     */
    const handlePreview = useCallback((file, fileList) => {
        // 닫힘 애니메이션 중에 다시 열면 예약된 정리 작업을 취소한다.
        if (exitTimerRef.current) {
            clearTimeout(exitTimerRef.current);
            exitTimerRef.current = null;
        }
        // 이전에 열어둔 blob들을 먼저 정리(닫자마자 바로 다시 여는 경우 누수 방지).
        revokeAllBlobs();

        const list = Array.isArray(fileList) && fileList.length > 0 ? fileList : [file];
        const items = [];
        const blobs = [];
        let current = 0;
        list.forEach((f) => {
            const resolved = fileToUrl(f);
            if (!resolved) return;
            items.push({ src: resolved.url });
            if (resolved.isBlob) blobs.push(resolved.url);
            // 클릭한 파일과 같은 항목을 시작 인덱스로 (uid로 매칭, 없으면 참조 비교)
            if ((f.uid && file.uid && f.uid === file.uid) || f === file) current = items.length - 1;
        });
        if (items.length === 0) return;

        activeBlobsRef.current = blobs;
        // 아래 넷은 같은 이벤트 안이라 React가 한 번의 렌더로 묶는다.
        setPreviewSession((n) => n + 1);
        setPreviewItems(items);
        setPreviewCurrent(current);
        setPreviewOpen(true);
    }, [revokeAllBlobs]);

    const handleCancel = useCallback(() => {
        // 1) 먼저 닫기만 — DOM은 그대로 두어 AntD가 닫힘 애니메이션을 재생하게 함
        setPreviewOpen(false);

        // 2) 애니메이션이 끝난 뒤에야 실제 정리 (목록 비우기 + blob URL 해제)
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => {
            revokeAllBlobs();
            setPreviewItems([]);
            setPreviewCurrent(0);
            exitTimerRef.current = null;
        }, EXIT_DURATION);
    }, [revokeAllBlobs]);

    // 스와이프로 장 넘기기는 이 훅에 두지 않는다.
    // 프리뷰를 여는 경로가 두 가지(이 훅 / PreviewGroup 직접 사용)라 어느 한쪽 state 에
    // 묶으면 반쪽만 동작한다 — 실제로 그렇게 만들었다가 가게 상세에서 전혀 안 먹었다.
    // 지금은 App.jsx 가 useImagePreviewSwipe() 를 전역 1회 호출한다(DOM 기준으로 동작).

    /*
     * 컴포넌트가 아니라 **엘리먼트**를 돌려준다.
     * 소비 측은 `{previewNode}` 로 그냥 꽂으면 된다 — 타입(ImagePreviewPortal)이 고정이라
     * 이 엘리먼트가 매 렌더 새로 만들어져도 React는 같은 자리로 보고 remount하지 않는다.
     */
    const previewNode = (
        <ImagePreviewPortal
            open={previewOpen}
            items={previewItems}
            current={previewCurrent}
            sessionKey={previewSession}
            onClose={handleCancel}
            onCurrentChange={setPreviewCurrent}
        />
    );

    // AntD Upload의 미리보기 아이콘/썸네일이 <a href={file.url} target="_blank">로 렌더링되는데,
    // target="_blank"가 있으면 onPreview 안에서 e.preventDefault()를 해도 일부 브라우저에선 여전히
    // 새 탭이 열린다. 캡처 단계에서 그 <a>를 직접 잡아 preventDefault해서 네비게이션을 원천 차단한다.
    const suppressLinkNavigation = useCallback((e) => {
        const link = e.target.closest('a.ant-upload-list-item-thumbnail, a[title="파일 미리보기"]');
        if (link) e.preventDefault();
    }, []);

    return { previewOpen, handlePreview, handleCancel, previewNode, suppressLinkNavigation };
};

export default useImagePreview;
