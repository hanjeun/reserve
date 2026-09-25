// Keep syntax policies executable; rationale and exceptions live in docs/rules/code-conventions.md.
export const rules = {
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
