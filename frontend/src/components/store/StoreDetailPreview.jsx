import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { Button, SegmentedControl, PageContainer } from '../common';
import { StoreDetailPCLayout, StoreDetailMobileLayout } from '../../pages/store/StoreDetail';

const PREVIEW_DOCUMENT = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
const PHONE_WIDTH = 414;
const PHONE_HEIGHT = 750;
const PHONE_SCREEN_HEIGHT = 726;
const PREVIEW_HEIGHT = 680;

const syncPreviewStyles = (frameDocument, copies) => {
    for (const attribute of ['class', 'style', 'data-theme']) {
        const value = document.documentElement.getAttribute(attribute);
        if (value === null) frameDocument.documentElement.removeAttribute(attribute);
        else frameDocument.documentElement.setAttribute(attribute, value);
    }
    const sources = new Set(document.head.querySelectorAll('style, link[rel="stylesheet"]'));
    for (const [source, copy] of copies) {
        if (!sources.has(source)) {
            copy.node.remove();
            copies.delete(source);
        }
    }
    for (const source of sources) {
        const markup = source.outerHTML;
        const previous = copies.get(source);
        if (previous?.markup === markup) continue;
        const node = source.cloneNode(true);
        node.setAttribute('data-preview-style', '');
        if (previous) previous.node.replaceWith(node);
        else frameDocument.head.appendChild(node);
        copies.set(source, { node, markup });
    }
    frameDocument.body.setAttribute('style', 'margin:0;background:var(--c-bg-paper);color:var(--c-text-primary)');
};

/** The portal shares real layouts and CSS; registration edits stay outside the disabled reservation form. */
export default function StoreDetailPreview({ store, device = 'mobile', onDeviceChange, infoContent }) {
    const [form] = Form.useForm();
    const [frameDocument, setFrameDocument] = useState(null);
    const [availableWidth, setAvailableWidth] = useState(PHONE_WIDTH);
    const [expanded, setExpanded] = useState(false);
    const host = useRef(null);
    useLayoutEffect(() => {
        const update = () => setAvailableWidth(host.current?.clientWidth || PHONE_WIDTH);
        update();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        observer?.observe(host.current);
        window.addEventListener('resize', update);
        return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
    }, []);
    useLayoutEffect(() => {
        if (!frameDocument) return undefined;
        // Keep unchanged stylesheets attached when another component inserts its styles.
        const copies = new Map();
        const copyStyles = () => syncPreviewStyles(frameDocument, copies);
        copyStyles();
        const observer = new MutationObserver(copyStyles);
        observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
        return () => { observer.disconnect(); copies.forEach(copy => copy.node.remove()); };
    }, [frameDocument]);
    const mobile = device === 'mobile';
    const width = mobile ? 390 : 1100;
    const frameWidth = mobile ? PHONE_WIDTH : width;
    const frameHeight = mobile ? PHONE_HEIGHT : PREVIEW_HEIGHT;
    const fitScale = Math.min(1, availableWidth / frameWidth);
    const scale = !mobile && expanded ? 1 : fitScale;
    const canExpand = !mobile && fitScale < 1;
    useLayoutEffect(() => {
        if (host.current) host.current.scrollLeft = 0;
        const scrollingElement = frameDocument?.scrollingElement;
        scrollingElement?.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    }, [device, expanded, frameDocument]);
    const changeDevice = value => { setExpanded(false); onDeviceChange(value); };
    const Layout = mobile ? StoreDetailMobileLayout : StoreDetailPCLayout;
    const images = store.detailImageUrls?.length ? store.detailImageUrls : [store.mainImageUrl];
    return <section className="reserve-onboarding-preview" aria-label="가게 상세 미리보기">
        <div className="reserve-onboarding-preview-toolbar"><strong>가게 상세 미리보기</strong>
            <div className="reserve-onboarding-preview-controls">
                <SegmentedControl block={false} value={device} onChange={changeDevice} options={[{ value: 'mobile', label: '모바일' }, { value: 'pc', label: 'PC' }]} />
                {canExpand && <Button variant="ghost-sm" size="sm" htmlType="button" aria-pressed={expanded} style={{ minHeight: 44, paddingInline: 4 }}
                    onClick={() => setExpanded(value => !value)}>{expanded ? '화면 맞춤' : '확대'}</Button>}
            </div>
        </div>
        <div ref={host} className="reserve-onboarding-preview-host" data-device={device}
            role="region" aria-label={`${mobile ? '모바일' : 'PC'} 미리보기 화면`} tabIndex={mobile ? undefined : 0}
            style={{ height: frameHeight * scale + (mobile ? 0 : expanded && canExpand ? 22 : 2) }}>
            <div className="reserve-onboarding-preview-stage" style={{ width: frameWidth * scale, height: frameHeight * scale }}>
                <div className="reserve-onboarding-preview-device" data-device={device}
                    style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }}>
                    <iframe title={`${mobile ? '모바일' : 'PC'} 가게 상세 미리보기`} srcDoc={PREVIEW_DOCUMENT}
                        sandbox="allow-same-origin" onLoad={event => setFrameDocument(event.currentTarget.contentDocument)}
                        style={{ width, height: mobile ? PHONE_SCREEN_HEIGHT : PREVIEW_HEIGHT }} />
                </div>
            </div>
        </div>
        {frameDocument && createPortal(<PageContainer className="reserve-store-detail reserve-store-detail--preview" size={device === 'mobile' ? 'md' : 'xl'}
            paddingTop={mobile ? '20px' : '32px'} paddingBottom="24px" style={{ minHeight: 0 }}>
            <Layout preview infoContent={infoContent} sliderImages={images.filter(Boolean)} identityProps={{ store, nearby: false, canContact: false }}
                panelProps={{ store, form }} />
        </PageContainer>, frameDocument.body)}
        <div className="reserve-onboarding-preview-help">
            {canExpand && <p>{expanded ? '확대한 PC 화면은 좌우로 스크롤해 확인할 수 있어요.' : '확대하면 글자와 수정 버튼을 자세히 확인할 수 있어요.'}</p>}
            <p>미리보기에서는 예약·접수를 실행하지 않아요.</p>
        </div>
    </section>;
}
StoreDetailPreview.propTypes = {
    store: PropTypes.object.isRequired,
    device: PropTypes.oneOf(['mobile', 'pc']),
    onDeviceChange: PropTypes.func.isRequired,
    infoContent: PropTypes.node,
};
