import { useState, useCallback, useRef, useEffect } from 'react';
import { Image } from 'antd';

/**
 * Upload 컴포넌트의 이미지 미리보기 훅
 * (가게 등록 / 가게 수정 / 광고 관리 — 이 훅을 쓰는 3곳 전부 동일하게 적용됨)
 *
 * Image.PreviewGroup + items 방식 (AntD v5+)
 *   → 소스 이미지가 화면에 없어도 AntD PreviewGroup 자체 애니메이션(fade+scale) 적용됨
 *
 * ── 2026-07 여러 장 넘겨보기 지원 (6) ────────────────────────────────────────
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
 * ── 닫힘 애니메이션 (8) ──────────────────────────────────────────────────────
 * visible=false만 먼저 내리고, 실제 정리(목록 비우기 + blob revoke)는 EXIT_DURATION 뒤로 미룬다 —
 * 그래야 AntD가 닫힘 트랜지션을 재생할 DOM이 남는다. 애니메이션 도중 다시 열면 타이머를 취소한다.
 * PreviewModal은 참조를 완전히 고정(useCallback deps 비움)하고 최신 state는 ref로 읽는다 —
 * 참조가 매번 바뀌면 소비 측이 자식 트리를 통째로 remount해서 닫힘 트랜지션이 묻혀버리기 때문.
 *
 * ── 툴바 (7) ────────────────────────────────────────────────────────────────
 * AntD 기본 프리뷰 툴바는 우리 톤과 이질적이라, index.css에서 .reserve-image-preview 규칙으로
 * 툴바를 우리 디자인 시스템 톤(평소엔 아이콘만, hover 시에만 둥근 박스)으로 맞춘다.
 */

// AntD Image preview의 닫힘 트랜지션(zoom/fade) 재생 시간. 여유를 조금 둠.
const EXIT_DURATION = 300;

// blob URL 해제 공통 헬퍼 — blob이 아닌 URL(S3/CloudFront)은 해제 대상이 아니다. (상태 비의존 순수 함수 → 모듈 레벨)
const revokeIfBlob = (url) => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
};

// AntD Upload file → 미리보기 URL. 업로드 전(originFileObj) 파일은 blob 생성. (상태 비의존 순수 함수 → 모듈 레벨)
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
    const exitTimerRef = useRef(null);
    // 현재 화면에 띄우고 있는 blob URL들 — 언마운트/닫힘 cleanup에서 해제해야 하므로 ref로 보관
    // (클로저가 캡쳐한 시점의 state가 아니라 최신 값을 봐야 한다).
    const activeBlobsRef = useRef([]);
    // 프리뷰를 열 때마다 1씩 증가하는 세션 번호 — PreviewGroup의 key로 쓴다.
    // (닫힘 정리를 EXIT_DURATION만큼 미루기 때문에, 그 안에 다시 열면 아직 퇴장 중인 DOM이
    //  그대로 살아있다. AntD는 그 엘리먼트를 재사용하는데, 퇴장 모션이 끝나기 전에 다시
    //  visible=true가 되면 입장 모션이 병합되어 생략된다 — "빨리 열고 닫으면 여는 애니메이션만
    //  씹힌다"의 원인. key를 바꿔 강제로 새 인스턴스를 마운트하면 항상 처음부터 재생된다.)
    const previewSessionRef = useRef(0);

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
        previewSessionRef.current += 1; // 새 세션 — PreviewGroup을 새로 마운트시켜 입장 애니메이션을 보장
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

    // 최신 값을 ref로도 들고 있는다 — 아래 PreviewModal의 deps를 비워 참조를 고정하기 위한 용도.
    // (안정적 identity의 PreviewModal이 최신 state를 읽게 하려는 의도적 ref 동기화. useEffect로 옮기면
    //  한 렌더 밀려 PreviewModal이 stale 값을 읽어 프리뷰가 안 열리므로, 이 3줄만 rule 예외 처리.)
    const previewOpenRef = useRef(previewOpen);
    const previewItemsRef = useRef(previewItems);
    const previewCurrentRef = useRef(previewCurrent);
    /* eslint-disable react-hooks/refs */
    previewOpenRef.current = previewOpen;
    previewItemsRef.current = previewItems;
    previewCurrentRef.current = previewCurrent;
    /* eslint-enable react-hooks/refs */

    // 스와이프로 장 넘기기는 이 훅에 두지 않는다.
    // 프리뷰를 여는 경로가 두 가지(이 훅 / PreviewGroup 직접 사용)라 어느 한쪽 state 에
    // 묶으면 반쪽만 동작한다 — 실제로 그렇게 만들었다가 가게 상세에서 전혀 안 먹었다.
    // 지금은 App.jsx 가 useImagePreviewSwipe() 를 전역 1회 호출한다(DOM 기준으로 동작).

    /**
     * Image.PreviewGroup + items 방식
     * - visible / onVisibleChange 로 열기/닫기를 외부에서 제어
     * - items가 비워지는 시점이 닫힘 애니메이션 이후로 미뤄졌기 때문에 early return이 애니메이션을 자르지 않는다.
     * - deps를 비워 이 함수(컴포넌트) 참조를 완전히 고정 — 최신 값은 위 ref로 읽는다.
     * - classNames.popup.root 로 우리 톤 툴바 CSS(.reserve-image-preview)를 건다.
     */
    const PreviewModal = useCallback(() => {
        if (previewItemsRef.current.length === 0) return null;
        return (
            <Image.PreviewGroup
                key={previewSessionRef.current}
                items={previewItemsRef.current}
                preview={{
                    visible: previewOpenRef.current,
                    onVisibleChange: (visible) => { if (!visible) handleCancel(); },
                    current: previewCurrentRef.current,
                    // current를 controlled로 주면 AntD가 매 렌더 그 값으로 강제해서, onChange로
                    // 사용자의 넘김을 state/ref에 반영해주지 않으면 화살표를 눌러도 시작 인덱스로
                    // 되돌아가 버린다(넘김이 안 되는 버그의 원인). 여기서 ref를 먼저 갱신해 다음
                    // 렌더에서도 같은 인덱스가 유지되게 하고, state도 갱신해 리렌더를 트리거한다.
                    onChange: (index) => { previewCurrentRef.current = index; setPreviewCurrent(index); },
                }}
                /*
                 * ★ 툴바 톤 CSS 를 거는 자리 (2026-08-29 최종 정리).
                 *
                 * 예전엔 `preview={{ rootClassName }}` 이었고 antd 6 가 deprecated 경고를 띄웠다.
                 * 경고가 시키는 대로 `classNames.root` 로 옮겼더니 클래스가 아예 안 붙어서
                 * (2026-07-30) 경고를 감수하고 되돌렸었는데 — **경고 문구가 틀렸던 것**이다.
                 *
                 * antd 소스(image/PreviewGroup.js)를 보면 `preview.rootClassName` 은
                 * `classNames.popup.root` 자리로 들어간다. `classNames.root` 는 이미지 래퍼고,
                 * 미리보기 오버레이는 `popup.root` 다. 경고는 그 둘을 구분하지 못한다.
                 *
                 * 브라우저에서 확인: `.ant-image-preview ... reserve-image-preview` 로 정확히 붙고
                 * 툴바·화살표·닫기가 그대로 살아 있으며 경고는 사라진다.
                 */
                classNames={{ popup: { root: 'reserve-image-preview' } }}
            />
        );
    }, [handleCancel]);

    // AntD Upload의 미리보기 아이콘/썸네일이 <a href={file.url} target="_blank">로 렌더링되는데,
    // target="_blank"가 있으면 onPreview 안에서 e.preventDefault()를 해도 일부 브라우저에선 여전히
    // 새 탭이 열린다. 캡처 단계에서 그 <a>를 직접 잡아 preventDefault해서 네비게이션을 원천 차단한다.
    const suppressLinkNavigation = useCallback((e) => {
        const link = e.target.closest('a.ant-upload-list-item-thumbnail, a[title="파일 미리보기"]');
        if (link) e.preventDefault();
    }, []);

    return { previewOpen, handlePreview, handleCancel, PreviewModal, suppressLinkNavigation };
};

export default useImagePreview;
