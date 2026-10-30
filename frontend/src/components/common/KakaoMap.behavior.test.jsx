import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KakaoMap from './KakaoMap';
import { loadKakaoMapsSdk } from './kakaoMapsLoader';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => motion.reduced }));
vi.mock('./kakaoMapsLoader', () => ({ loadKakaoMapsSdk: vi.fn() }));
let maps;
beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', undefined);
    motion.reduced = false;
    class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } getLat() { return this.lat; } getLng() { return this.lng; } }
    maps = {
        LatLng,
        Map: vi.fn(function (container, options) {
            this.container = container; this.center = options.center; this.level = options.level;
            this.getCenter = () => this.center; this.getLevel = () => this.level;
            this.setCenter = point => { this.center = point; }; this.relayout = vi.fn();
            this.jump = vi.fn((point, level) => { this.center = point; this.level = level; });
        }),
        CustomOverlay: vi.fn(function ({ map, content }) {
            map.container.append(content); this.setMap = value => { if (!value) content.remove(); };
        }),
        services: { Status: { OK: 'OK' }, Geocoder: vi.fn(function () {
            this.addressSearch = vi.fn((address, callback) => callback([{ y: '37.5', x: '127' }], 'OK'));
        }) },
    };
    loadKakaoMapsSdk.mockReset().mockResolvedValue({ maps });
});
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])('restores position and zoom on the same map with reduced motion=%s', async reduced => {
    motion.reduced = reduced;
    render(<KakaoMap latitude={37.5} longitude={127} address="서울" storeName="가게" />);
    const button = await screen.findByRole('button', { name: '가게 위치로 돌아가기' });
    const map = maps.Map.mock.instances[0];
    map.center = new maps.LatLng(36, 126); map.level = 10;
    fireEvent.click(button);
    expect(map.jump).toHaveBeenCalledWith(expect.objectContaining({ lat: 37.5, lng: 127 }), 4, { animate: !reduced });
    fireEvent.click(button);
    expect(map.jump).toHaveBeenCalledTimes(1);
    expect(maps.Map).toHaveBeenCalledTimes(1);
    expect(loadKakaoMapsSdk).toHaveBeenCalledTimes(1);
    expect(maps.services.Geocoder).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '카카오맵으로 보기' })).toHaveAttribute('href', 'https://map.kakao.com/link/search/' + encodeURIComponent('서울'));
});

it('geocodes missing coordinates once and never repeats it during restoration', async () => {
    render(<KakaoMap address="서울" storeName="주소 가게" />);
    const button = await screen.findByRole('button', { name: '주소 가게 위치로 돌아가기' });
    const map = maps.Map.mock.instances[0];
    map.center = new maps.LatLng(36, 126); map.level = 10;
    await act(async () => fireEvent.click(button));
    expect(maps.services.Geocoder).toHaveBeenCalledTimes(1);
    expect(maps.services.Geocoder.mock.instances[0].addressSearch).toHaveBeenCalledTimes(1);
    expect(maps.Map).toHaveBeenCalledTimes(1);
});
