// Keep syntax policies executable; rationale and exceptions live in docs/rules/code-conventions.md.
export const rules = {
    'user-copy-tone': {
        meta: {
            type: 'suggestion',
            schema: [],
            messages: { tone: '일반 사용자 안내는 해요체로 쓰세요. 버튼·상태는 짧은 명사형, 약관·개인정보처리방침은 격식체를 사용합니다.' },
        },
        create(context) {
            const file = context.filename.replaceAll('\\', '/');
            if (/\/pages\/legal\/(Terms|Privacy)\.jsx$/.test(file)) return {};
            const check = (node, text) => {
                if (typeof text === 'string' && /[가-힣]*(?:니다|니까)(?![가-힣])/.test(text)) {
                    context.report({ node, messageId: 'tone' });
                }
            };
            return {
                Literal: node => check(node, node.value),
                TemplateElement: node => check(node, node.value.cooked ?? node.value.raw),
                JSXText: node => check(node, node.value),
            };
        },
    },
    'no-threatening-copy': {
        meta: {
            type: 'problem',
            schema: [],
            messages: { threat: '고소·고발·처벌·법적 조치를 경고하는 문구 대신 필요한 이용 조건과 문의 방법을 안내하세요.' },
        },
        create(context) {
            const check = (node, text) => {
                if (typeof text === 'string' && /(?:고소|고발)(?:$|[^가-힣]|장|하|할|해|합|했|당|되|를)|처벌|법적\s*(?:조치|대응)|(?:민사|형사)\s*책임/.test(text)) {
                    context.report({ node, messageId: 'threat' });
                }
            };
            return {
                Literal: node => check(node, node.value),
                TemplateElement: node => check(node, node.value.cooked ?? node.value.raw),
                JSXText: node => check(node, node.value),
            };
        },
    },
    'plain-jsdoc': {
        meta: {
            type: 'suggestion',
            schema: [],
            messages: {
                markup: 'JS 주석에는 Java 전용 {@code}나 HTML 제목 대신 평문/JSDoc을 사용하세요. 긴 변경 이력은 문서로 옮기세요.',
            },
        },
        create(context) {
            return {
                Program() {
                    for (const comment of context.sourceCode.getAllComments()) {
                        if (/\{@code\b|<\/?h[1-6](?:\s[^>]*)?>/i.test(comment.value)) {
                            context.report({ loc: comment.loc, messageId: 'markup' });
                        }
                    }
                },
            };
        },
    },
    'no-jsx-style-tag': {
        meta: {
            type: 'problem',
            schema: [],
            messages: {
                global: '전역 CSS는 index.css 또는 거기서 import하는 styles/global/ 모듈에 두세요. 인스턴스 style prop은 허용됩니다.',
            },
        },
        create(context) {
            return {
                JSXOpeningElement(node) {
                    if (node.name.type === 'JSXIdentifier' && node.name.name === 'style') {
                        context.report({ node, messageId: 'global' });
                    }
                },
            };
        },
    },
};
