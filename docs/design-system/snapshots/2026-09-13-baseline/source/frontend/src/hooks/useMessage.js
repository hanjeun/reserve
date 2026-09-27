import React from 'react';
import { App } from 'antd';

/**
 * 확인 다이얼로그 본문을 **문장 단위로 줄을 나눠** 렌더한다.
 *
 * 왜 필요한가 — 확인 모달 본문은 대부분 "설명 문장 + 되묻는 문장" 두 개다.
 * 한 문자열로 두면 모달 폭(AntD confirm 기본 416px, 본문 가용 폭은 아이콘·패딩 빼고 350px 남짓 =
 * 한글 24자 안팎)에서 문장 중간이 잘리고 마지막 몇 글자만 다음 줄로 넘어간다.
 * 실제로 회원 탈퇴 모달이 "…없습니다. 정말 / 탈퇴하시겠습니까?" 로 어정쩡하게 끊겨 보였다.
 *
 * 왜 `<br/>`이 아니라 block 요소인가 — `<br/>`은 폭과 무관하게 그 자리에서 강제로 끊는다.
 * 문장마다 div로 감싸면 각 문장이 **자기 안에서** 자연스럽게 접히므로, 모바일처럼 폭이 좁아져
 * 한 문장이 두 줄이 되더라도 문장 경계는 그대로 유지된다.
 *
 * 왜 호출부가 아니라 여기인가 — 확인 모달이 코드베이스에 8곳 있고 앞으로도 늘어난다.
 * 각 호출부에서 JSX로 쪼개면 새로 추가하는 사람이 매번 기억해야 하고, 실제로 그렇게 안 된다.
 * 래퍼에서 처리하면 호출부는 계속 평범한 문자열만 넘기면 된다.
 *
 * ReactNode를 넘긴 경우(직접 마크업을 구성한 모달)는 손대지 않고 그대로 통과시킨다.
 */
const splitIntoSentenceLines = (content) => {
    if (typeof content !== 'string') {
        return content;
    }

    // 마침표·물음표·느낌표 뒤의 공백에서 끊는다(lookbehind라 구분자는 앞 문장에 남는다).
    const sentences = content.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== '');

    // 문장이 하나면 쪼갤 이유가 없다 — 불필요한 div 래핑을 만들지 않는다.
    if (sentences.length <= 1) {
        return content;
    }

    // 이 파일은 .js라 JSX를 쓸 수 없다(Vite는 .jsx/.tsx만 JSX로 처리한다).
    return React.createElement(
        React.Fragment,
        null,
        ...sentences.map((sentence, i) => React.createElement('div', { key: i }, sentence)),
    );
};

/** AntD App.useApp() 래퍼 — message, modal, notification 제공 */
const useMessage = () => {
    const { message, modal, notification } = App.useApp();
    return {
        message,
        modal,
        notification,
        confirm: (options) => modal.confirm({
            title: '확인',
            okText: '확인',
            cancelText: '취소',
            /**
             * ★ 세로 가운데 정렬 (2026-08-24).
             *
             * AntD 기본값은 `centered: false` — 뷰포트 높이와 무관하게 위에서 100px 지점에 뜬다.
             * 데스크톱에서는 그럭저럭 보이지만 **모바일(430×932)에서는 화면 상단 15% 에 걸려**
             * 아래가 텅 빈 채로 떠 있다. 확인 모달은 "지금 이걸 결정하라"는 화면이라
             * 시선이 가는 자리에 있어야 한다.
             *
             * 호출부 8곳을 각각 고치지 않고 여기서 한 번에 정하는 이유는 이 프로젝트의
             * 반복 회귀 패턴 때문이다 — 같은 값이 여러 곳에 흩어지면 새로 추가하는 모달이
             * 반드시 빠진다(CLAUDE.md "규칙은 주석이 아니라 관문에 둔다").
             *
             * `...options` 앞에 둔다 — 특정 모달이 필요하면 덮어쓸 수 있어야 한다.
             */
            centered: true,
            ...options,
            // ...options 뒤에 와야 한다 — 앞에 두면 options.content가 원본 문자열로 덮어쓴다.
            content: splitIntoSentenceLines(options?.content),
        }),
    };
};

export default useMessage;
