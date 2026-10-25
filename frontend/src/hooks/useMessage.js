import React from 'react';
import { App } from 'antd';

/*
 * 문자열 본문은 문장별 블록으로 나눠 좁은 화면에서도 문장 경계를 유지한다. 직접 전달된 ReactNode는 그대로 사용한다.
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

    // 같은 문장이 반복되어도 문장 내용과 등장 횟수로 키를 구분한다.
    const occurrences = new Map();
    // 이 파일은 .js라 JSX를 쓸 수 없다(Vite는 .jsx/.tsx만 JSX로 처리한다).
    return React.createElement(
        React.Fragment,
        null,
        ...sentences.map(sentence => {
            const occurrence = (occurrences.get(sentence) ?? 0) + 1;
            occurrences.set(sentence, occurrence);
            return React.createElement('div', { key: `${sentence}:${occurrence}` }, sentence);
        }),
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
            /*
             * 확인 모달은 기본으로 세로 중앙에 둔다. 개별 호출은 options로 덮어쓸 수 있다.
             */
            centered: true,
            ...options,
            // Portal 안에서도 확인 모달의 좁은 화면·긴 본문 레이아웃을 한 관문에서 적용한다.
            // 호출부의 rootClassName과 안전 조건/onOk 등은 그대로 보존한다.
            rootClassName: ['reserve-confirm-root', options?.rootClassName].filter(Boolean).join(' '),
            // ...options 뒤에 와야 한다 — 앞에 두면 options.content가 원본 문자열로 덮어쓴다.
            content: splitIntoSentenceLines(options?.content),
        }),
    };
};

export default useMessage;
