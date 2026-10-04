import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import { DISCOVERY_NAV_ITEMS } from '../../constants/discovery';

const SLIDE_MS = 200;

/** 활성 탭 밑줄의 위치·너비(px). 안쪽 여백은 CSS 의 --reserve-top-nav-underline-inset 과 같은 값을 쓴다. */
function underlineOf(inner, path) {
    const link = [...inner.querySelectorAll('a')].find(a => a.getAttribute('href') === path);
    if (!link) return null;
    const inset = (Number.parseFloat(getComputedStyle(inner).getPropertyValue('--reserve-top-nav-underline-inset')) || 0) / 100;
    return { x: link.offsetLeft + link.offsetWidth * inset, w: link.offsetWidth * (1 - inset * 2) };
}

const prefersReducedMotion = () => typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 주요 탐색 화면에만 남는 탭. 계정·예약·메시지는 프로필 메뉴에서 제공한다. */
export default function DiscoveryNav({ pendingPathname }) {
    const { pathname } = useLocation();
    const currentPath = (pendingPathname || pathname).replace(/\/$/, '') || '/';
    // 탭을 누르면 지금 탭의 밑줄 자리에서 누른 탭으로 밑줄 하나가 미끄러진다(2026-09-25).
    // 평소에는 활성 탭의 ::after 밑줄을 그대로 쓰고, 미끄러지는 동안에만 임시 밑줄을 보인다.
    const innerRef = useRef(null);
    const [slide, setSlide] = useState(null);

    const startSlide = (event, to) => {
        const plainClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
        const inner = innerRef.current;
        if (!plainClick || to === currentPath || !inner || prefersReducedMotion()) return;
        const from = underlineOf(inner, currentPath);
        const target = underlineOf(inner, to);
        if (from && target) setSlide({ ...from, to: target, moving: false });
    };

    useEffect(() => {
        if (!slide) return undefined;
        if (!slide.moving) {
            // 출발 위치가 한 번 그려진 뒤에 목적지로 바꿔야 transition 이 걸린다.
            let second = 0;
            const first = requestAnimationFrame(() => {
                second = requestAnimationFrame(() => setSlide(s => s && { ...s.to, to: s.to, moving: true }));
            });
            return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
        }
        const done = window.setTimeout(() => setSlide(null), SLIDE_MS + 80);
        return () => window.clearTimeout(done);
    }, [slide]);

    return (
        <nav className={'reserve-discovery-top-nav' + (slide ? ' is-sliding' : '')} aria-label="서비스 탐색">
            <div className="reserve-discovery-top-nav-inner" ref={innerRef}>
                {slide && (
                    <span className="reserve-discovery-top-nav-indicator" aria-hidden="true"
                        style={{ transform: `translateX(${slide.x}px)`, width: slide.w }} />
                )}
                {DISCOVERY_NAV_ITEMS.map(item => (
                    <Link key={item.to} to={item.to} aria-current={currentPath === item.to ? 'page' : undefined}
                        onClick={event => startSlide(event, item.to)}>
                        {item.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
DiscoveryNav.propTypes = { pendingPathname: PropTypes.string };
