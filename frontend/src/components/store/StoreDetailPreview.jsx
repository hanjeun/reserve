import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { SegmentedControl, PageContainer } from '../common';
import { DownOutlined } from '../common/icons';
import Header from '../layout/Header';
import { StoreDetailPCLayout, StoreDetailMobileLayout } from '../../pages/store/StoreDetail';
import { breakpoints } from '../../styles/tokens';
import { storeGalleryImages } from '../../utils/storeImages';
import phoneHardware from '../../assets/store-preview/iphone16-pro.png';
import cellular from '../../assets/store-preview/cellular.svg';
import wifi from '../../assets/store-preview/wifi.svg';
import battery from '../../assets/store-preview/battery.svg';

const PREVIEW_DOCUMENT = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
const PHONE_WIDTH = 450;
const PHONE_HEIGHT = 920;
const DESKTOP_PHONE_WIDTH = 312;
const PHONE_SCREEN_WIDTH = 402;
const PHONE_CONTENT_HEIGHT = 780;
const PREVIEW_HEIGHT = 680;
const TOUCH_INPUT = '(pointer: coarse)';
const TAP_INTERVAL = 320;
const TAP_MOVEMENT = 10;
const TAP_DISTANCE = 24;
const INTERACTIVE_TARGET = 'a, button, input, select, textarea, label, summary, [contenteditable], [role="button"], [role="link"], [role="dialog"]';

function listenForPreviewDoubleTap(frameDocument, scale, onDoubleTap) {
    let active;
    let previous;
    const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) * scale;
    const clear = () => { active = undefined; previous = undefined; };
    const down = event => {
        if (event.pointerType !== 'touch') return;
        if (!event.isPrimary || event.target.closest?.(INTERACTIVE_TARGET)) clear();
        else active = event;
    };
    const move = event => {
        if (active?.pointerId === event.pointerId && distance(active, event) > TAP_MOVEMENT) clear();
    };
    const up = event => {
        if (!active || active.pointerId !== event.pointerId) return;
        if (event.timeStamp - active.timeStamp > TAP_INTERVAL || distance(active, event) > TAP_MOVEMENT) {
            clear();
            return;
        }
        active = undefined;
        if (previous && event.timeStamp - previous.timeStamp <= TAP_INTERVAL && distance(previous, event) <= TAP_DISTANCE) {
            clear();
            onDoubleTap(event);
        } else previous = event;
    };
    // iframe 안의 터치는 상위 문서로 전달되지 않는다.
    const listeners = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: clear };
    for (const [type, listener] of Object.entries(listeners)) {
        frameDocument.addEventListener(type, listener, { capture: true, passive: true });
    }
    return () => {
        for (const [type, listener] of Object.entries(listeners)) frameDocument.removeEventListener(type, listener, true);
    };
}

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
    Object.assign(frameDocument.body.style, { margin: '0', background: 'var(--c-bg-paper)', color: 'var(--c-text-primary)' });
};

/* 실제 상세 레이아웃·CSS를 공유하고 등록 입력은 비활성 예약 폼과 분리한다. */
export default function StoreDetailPreview({ store, device = 'mobile', onDeviceChange, infoContent }) {
    const [form] = Form.useForm();
    const [frameDocument, setFrameDocument] = useState(null);
    const [{ width: availableWidth, touch }, setViewport] = useState({ width: breakpoints.pc, touch: false });
    const [zoomedDevice, setZoomedDevice] = useState(null);
    const zoomHelp = useId();
    const host = useRef(null);
    const stage = useRef(null);
    const frame = useRef(null);
    const zoomAnchor = useRef(null);
    useLayoutEffect(() => {
        const media = window.matchMedia?.(TOUCH_INPUT);
        const update = () => {
            const width = host.current?.clientWidth || breakpoints.pc;
            const touch = media?.matches === true;
            setViewport(current => current.width === width && current.touch === touch ? current : { width, touch });
        };
        update();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        observer?.observe(host.current);
        window.addEventListener('resize', update);
        media?.addEventListener('change', update);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', update);
            media?.removeEventListener('change', update);
        };
    }, []);
    useLayoutEffect(() => {
        if (!frameDocument) return undefined;
        // 다른 컴포넌트가 스타일을 삽입해도 같은 스타일시트 노드는 유지한다.
        const copies = new Map();
        const copyStyles = () => syncPreviewStyles(frameDocument, copies);
        copyStyles();
        const observer = new MutationObserver(copyStyles);
        observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
        return () => { observer.disconnect(); copies.forEach(copy => copy.node.remove()); };
    }, [frameDocument]);
    const mobile = device === 'mobile';
    const frameWidth = mobile ? PHONE_WIDTH : Math.max(breakpoints.pc, availableWidth);
    const frameHeight = mobile ? PHONE_HEIGHT : PREVIEW_HEIGHT;
    const displayWidth = mobile && !touch ? Math.min(availableWidth, DESKTOP_PHONE_WIDTH) : availableWidth;
    const fitScale = Math.min(1, displayWidth / frameWidth);
    const canZoom = touch && fitScale < 1;
    const expanded = canZoom && zoomedDevice === device;
    const scale = expanded ? 1 : fitScale;
    useLayoutEffect(() => {
        if (host.current) host.current.scrollLeft = 0;
        frameDocument?.scrollingElement?.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    }, [device, frameDocument]);
    useLayoutEffect(() => {
        if (!frameDocument) return undefined;
        const root = frameDocument.documentElement;
        root.setAttribute('data-store-preview-device', device);
        root.toggleAttribute('data-store-preview-zoom', canZoom);
        if (!canZoom) return undefined;
        return listenForPreviewDoubleTap(frameDocument, scale, event => {
            const x = frame.current.getBoundingClientRect().left + event.clientX * scale;
            zoomAnchor.current = {
                x: (x - stage.current.getBoundingClientRect().left) / scale,
                hostX: x - host.current.getBoundingClientRect().left - host.current.clientLeft,
                y: event.clientY,
                scale,
            };
            setZoomedDevice(expanded ? null : device);
        });
    }, [frameDocument, device, canZoom, expanded, scale]);
    useLayoutEffect(() => {
        const anchor = zoomAnchor.current;
        zoomAnchor.current = null;
        if (!anchor) return;
        host.current.scrollLeft = anchor.x * scale - anchor.hostX;
        const scrollingElement = frameDocument?.scrollingElement;
        if (scrollingElement) scrollingElement.scrollTo({
            top: scrollingElement.scrollTop + anchor.y * (1 - anchor.scale / scale),
            behavior: 'instant',
        });
    }, [frameDocument, scale]);
    const changeDevice = value => {
        if (value === device) return;
        setZoomedDevice(null);
        onDeviceChange(value);
    };
    const Layout = mobile ? StoreDetailMobileLayout : StoreDetailPCLayout;
    const images = storeGalleryImages(store).map(image => image.url);
    return <section className="reserve-onboarding-preview" aria-label="가게 상세 미리보기">
        <div className="reserve-onboarding-preview-toolbar"><strong>가게 상세 미리보기</strong>
            <SegmentedControl aria-label="미리보기 화면 유형" block={false} value={device} onChange={changeDevice}
                options={[{ value: 'mobile', label: '모바일' }, { value: 'pc', label: 'PC' }]} />
        </div>
        {canZoom && <span id={zoomHelp} className="reserve-sr-only">
            {expanded ? '두 번 터치하거나 Enter를 눌러 화면에 맞출 수 있어요.' : '두 번 터치하거나 Enter를 눌러 확대할 수 있어요.'}
        </span>}
        <div ref={host} className="reserve-onboarding-preview-host" data-device={device} data-zoomed={expanded}
            role="region" aria-label={`${mobile ? '모바일' : 'PC'} 미리보기 화면`} tabIndex={canZoom ? 0 : undefined}
            aria-describedby={canZoom ? zoomHelp : undefined} aria-keyshortcuts={canZoom ? 'Enter' : undefined}
            onKeyDown={event => {
                if (canZoom && event.target === event.currentTarget && event.key === 'Enter' && !event.repeat) {
                    event.preventDefault();
                    setZoomedDevice(expanded ? null : device);
                }
            }}>
            <div ref={stage} className="reserve-onboarding-preview-stage" style={{ width: frameWidth * scale, height: frameHeight * scale }}>
                <div className="reserve-onboarding-preview-device" data-device={device}
                    style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }}>
                    <div className="reserve-onboarding-preview-window">
                        {mobile && <div className="reserve-onboarding-phone-status" aria-hidden="true">
                            <strong>12:30</strong>
                            <span><img src={cellular} alt="" /><img src={wifi} alt="" /><img src={battery} alt="" /></span>
                        </div>}
                        <iframe ref={frame} title={`${mobile ? '모바일' : 'PC'} 가게 상세 미리보기`} srcDoc={PREVIEW_DOCUMENT}
                            sandbox="allow-same-origin" onLoad={event => setFrameDocument(event.currentTarget.contentDocument)}
                            width={mobile ? PHONE_SCREEN_WIDTH : frameWidth} height={mobile ? PHONE_CONTENT_HEIGHT : PREVIEW_HEIGHT} />
                        {mobile && <span className="reserve-onboarding-phone-home" aria-hidden="true" />}
                    </div>
                    {mobile && <img className="reserve-onboarding-phone-hardware" src={phoneHardware} width={PHONE_WIDTH} height={PHONE_HEIGHT}
                        alt="" aria-hidden="true" decoding="async" />}
                </div>
            </div>
        </div>
        {frameDocument && createPortal(<>
            <div className="reserve-onboarding-preview-header" inert><Header restoreControls /></div>
            <PageContainer className="reserve-store-detail reserve-store-detail--preview" size={mobile ? 'md' : 'xl'} paddingTop={mobile ? '20px' : '32px'}>
                <Layout preview previewDocument={frameDocument} sliderImages={images} identityProps={{ store, nearby: false, canContact: false }}
                    panelProps={{ store, form }} />
            </PageContainer>
        </>, frameDocument.body)}
        <p className="reserve-onboarding-preview-help">미리보기에서는 예약·접수를 실행하지 않아요.</p>
        {infoContent && <details className="reserve-onboarding-advanced reserve-onboarding-preview-edits">
            <summary>가게 설정 수정 <DownOutlined className="reserve-filter-menu-chevron" aria-hidden="true" /></summary>
            <div>{infoContent}</div>
        </details>}
    </section>;
}
StoreDetailPreview.propTypes = {
    store: PropTypes.object.isRequired,
    device: PropTypes.oneOf(['mobile', 'pc']),
    onDeviceChange: PropTypes.func.isRequired,
    infoContent: PropTypes.node,
};
