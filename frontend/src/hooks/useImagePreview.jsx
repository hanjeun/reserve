import { useState, useCallback, useRef, useEffect } from 'react';
import ImagePreviewPortal from '../components/common/ImagePreviewPortal';

/*
 * 미리보기의 blob URL을 닫힘 전환 후 해제한다. 닫히는 중 재개하면 정리 타이머를 취소하며 서버 URL은 해제하지 않는다.
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
     * 미리보기 세대는 렌더의 key에 쓰므로 상태로 보관한다.
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
     * 고정된 컴포넌트 타입의 엘리먼트를 반환해 소비자의 렌더마다 미리보기가 재마운트되지 않게 한다.
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
