import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp, Layout } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { Router, Routes, Route, createPath } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import Header from '../../frontend/src/components/layout/Header';
import DiscoveryNav from '../../frontend/src/components/layout/DiscoveryNav';
import WorkspaceNavigationProvider from '../../frontend/src/components/layout/WorkspaceNavigationProvider';
import WorkspaceMenuProvider from '../../frontend/src/components/layout/WorkspaceMenuProvider';
import ServiceAdmissionProvider from '../../frontend/src/components/common/ServiceAdmissionProvider';
import { RouteErrorBoundary } from '../../frontend/src/components/layout/AppErrorBoundary';
import StoreList from '../../frontend/src/pages/store/StoreList';
import StoreDetail from '../../frontend/src/pages/store/StoreDetail';
import MyReservations from '../../frontend/src/pages/reservation/MyReservations';
import QrCodeModal from '../../frontend/src/components/reservation/QrCodeModal';
import useMessage from '../../frontend/src/hooks/useMessage';
import { LiveUpdatesContext } from '../../frontend/src/hooks/useLiveUpdatesStatus';
import { appMessageConfig, buildThemeConfig, validateMessages } from '../../frontend/src/components/common/appProviderConfig';
import { uiIconConfig } from '../../frontend/src/components/common/uiIconConfig';
import { loadingConfig } from '../../frontend/src/components/common/loadingConfig';
import useTheme, { initTheme } from '../../frontend/src/hooks/useTheme';
import useImagePreviewSwipe from '../../frontend/src/hooks/useImagePreviewSwipe';
import useModalScrollLock from '../../frontend/src/hooks/useModalScrollLock';
import useAuthStore from '../../frontend/src/store/useAuthStore';
import api from '../../frontend/src/api/axios';
import { createPreviewTransport } from './transport';
import { createPreviewPlayback, isPreviewMessage } from './playback';
import { resolvePreviewLocation } from './navigation';
import '../../frontend/src/index.css';
import './preview.css';

const scenes = new Set(['explore', 'booking', 'reservations', 'waiting', 'qr']);
function FixedPage({ scene, children }) {
    const [location, setLocation] = useState(() => ({ ...resolvePreviewLocation(scene), key: 'preview-0', state: null }));
    const navigator = useMemo(() => {
        const move = (to, state) => {
            const target = resolvePreviewLocation(scene, to);
            if (target) setLocation(previous => ({ ...target, state, key: 'preview-' + (Number(previous.key.slice(8)) + 1) }));
        };
        return { createHref: to => typeof to === 'string' ? to : createPath(to), go: () => {}, push: move, replace: move };
    }, [scene]);
    return <Router location={location} navigator={navigator}>{children}</Router>;
}

function PreviewStoreDetail() {
    const { message } = useMessage();
    return <StoreDetail onReservationSuccess={message.success} />;
}

function Preview({ scene, transport }) {
    const client = useQueryClient();
    const { resolvedTheme, accentColors } = useTheme();
    const theme = useMemo(() => buildThemeConfig(resolvedTheme === 'dark', accentColors), [resolvedTheme, accentColors]);
    const [qrOpen, setQrOpen] = useState(false);
    useImagePreviewSwipe(); useModalScrollLock();
    useEffect(() => {
        const playback = createPreviewPlayback(window, { scene, transport, client, setQrOpen });
        const parentOrigin = new URL(document.baseURI).origin;
        const receive = event => {
            if (!isPreviewMessage(event, window.parent, parentOrigin)) return;
            if (event.data.type === 'reserve:service-preview:active') {
                focusManager.setFocused(event.data.active); onlineManager.setOnline(event.data.active);
                document.documentElement.toggleAttribute('data-preview-paused', !event.data.active);
                playback.setActive(event.data.active);
            } else playback.setProgress(event.data.progress);
        };
        window.addEventListener('message', receive);
        // 바깥 화면은 시연의 첫 프레임이 그려질 때까지 골격을 유지한다.
        let readyFrame = window.requestAnimationFrame(() => {
            readyFrame = window.requestAnimationFrame(() => {
                window.parent.postMessage({ type: 'reserve:service-preview:ready' }, parentOrigin);
            });
        });
        return () => {
            window.cancelAnimationFrame(readyFrame);
            window.removeEventListener('message', receive);
            playback.dispose();
        };
    }, [scene, client, transport]);
    const blockPageLinks = event => {
        if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault();
    };
    return <ConfigProvider locale={koKR} theme={theme} {...uiIconConfig} {...loadingConfig}
        select={{ ...uiIconConfig.select, ...loadingConfig.select }} form={{ validateMessages }}>
        <AntApp message={appMessageConfig}><FixedPage scene={scene}><WorkspaceNavigationProvider><WorkspaceMenuProvider><ServiceAdmissionProvider>
            <Layout className="reserve-app-layout" onClickCapture={blockPageLinks}>
                <div inert style={{ display: 'contents' }}><Header />{scene === 'explore' && <DiscoveryNav />}</div>
                <Layout.Content><RouteErrorBoundary><Routes>
                    <Route path="/stores" element={<StoreList />} />
                    <Route path="/store/:id" element={<PreviewStoreDetail />} />
                    <Route path="/my-reservations" element={<MyReservations />} />
                </Routes>{scene === 'qr' && <QrCodeModal reservationId={701} open={qrOpen} onClose={() => setQrOpen(false)} />}</RouteErrorBoundary></Layout.Content>
            </Layout>
        </ServiceAdmissionProvider></WorkspaceMenuProvider></WorkspaceNavigationProvider></FixedPage></AntApp>
    </ConfigProvider>;
}

export function mountPreview() {
    if (globalThis.__RESERVE_PREVIEW_ISOLATED__ !== true) {
        document.getElementById('root').textContent = '이 환경에서는 미리보기를 열 수 없어요.';
        return;
    }
    const requested = new URLSearchParams(window.location.search).get('scene');
    const scene = scenes.has(requested) ? requested : 'explore';
    const transport = createPreviewTransport();
    api.defaults.adapter = transport.adapter; api.defaults.withCredentials = false;
    useAuthStore.getState().login(transport.member); initTheme();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60000, refetchOnWindowFocus: false } } });
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}>
        <LiveUpdatesContext.Provider value={{ present: true, connected: false, domains: [] }}><Preview scene={scene} transport={transport} /></LiveUpdatesContext.Provider>
    </QueryClientProvider>);
}

mountPreview();
