import { createElement } from 'react';

// 빌드할 때 마크업과 외부 CSS를 생성해 브라우저의 UI 런타임 의존성을 없앤다.
export const Typography = {
    Title: ({ level = 1, children, ...props }) => createElement(`h${level}`, props, children),
    Text: ({ children, ...props }) => <span {...props}>{children}</span>,
};

export function Flex({ align, justify, gap, style, children }) {
    return <div style={{ display: 'flex', alignItems: align, justifyContent: justify, gap, ...style }}>{children}</div>;
}

export function Divider({ style }) {
    return <hr style={{ border: 0, borderTop: '1px solid var(--c-border-light)', ...style }} />;
}

export function Collapse({ className, items, expandIcon }) {
    return <div className={`ant-collapse ${className}`}>
        {items.map(item => <details key={item.key} name="marketing-faq" className="ant-collapse-item">
            <summary className="ant-collapse-header">
                <span className="ant-collapse-header-text">{item.label}</span>
                <span className="ant-collapse-expand-icon">{expandIcon({ isActive: false })}</span>
            </summary>
            <div className="ant-collapse-content"><div className="ant-collapse-content-box">{item.children}</div></div>
        </details>)}
    </div>;
}
