import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion';

const SCROLL_IDLE_MS = 180;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

export default function StoreDetailSectionNav({ sections }) {
    const navigationRef = useRef(null);
    const tabScrollUntil = useRef(0);
    const [active, setActive] = useState(sections[0].id);
    const activeIndex = Math.max(0, sections.findIndex(section => section.id === active));
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const navigation = navigationRef.current;
        const document = navigation.ownerDocument;
        const view = document.defaultView;
        const targets = sections.map(({ id }) => document.getElementById(id)).filter(Boolean);
        const gap = Number.parseFloat(view.getComputedStyle(navigation).marginBottom) || 0;
        let frame;
        const update = () => {
            frame = undefined;
            if (view.performance.now() < tabScrollUntil.current) return;
            const edge = navigation.getBoundingClientRect().bottom + gap + 1;
            const scroll = document.scrollingElement;
            const atEnd = scroll?.scrollTop > 0 && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 1;
            const target = atEnd ? targets.at(-1) : targets.findLast(section => section.getBoundingClientRect().top <= edge);
            const id = (target ?? targets[0])?.id;
            if (id) setActive(id);
        };
        const schedule = () => { frame ??= view.requestAnimationFrame(update); };
        const handleScroll = () => {
            const now = view.performance.now();
            // 탭으로 이동하는 동안에는 지나가는 섹션에 선택선을 옮기지 않는다.
            if (now < tabScrollUntil.current) tabScrollUntil.current = now + SCROLL_IDLE_MS;
            else schedule();
        };
        const resumeScrollTracking = () => { tabScrollUntil.current = 0; };
        const handleScrollKey = event => {
            if (!event.defaultPrevented && SCROLL_KEYS.has(event.key)) resumeScrollTracking();
        };
        const resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null;
        // 사진과 리뷰가 로드되어 높이가 달라져도 현재 섹션을 다시 찾는다.
        [navigation, ...targets].forEach(node => resize?.observe(node));
        view.addEventListener('scroll', handleScroll, { passive: true });
        view.addEventListener('resize', schedule);
        view.addEventListener('wheel', resumeScrollTracking, { passive: true });
        view.addEventListener('touchmove', resumeScrollTracking, { passive: true });
        view.addEventListener('keydown', handleScrollKey);
        document.addEventListener('scrollend', resumeScrollTracking);
        schedule();
        return () => {
            view.removeEventListener('scroll', handleScroll);
            view.removeEventListener('resize', schedule);
            view.removeEventListener('wheel', resumeScrollTracking);
            view.removeEventListener('touchmove', resumeScrollTracking);
            view.removeEventListener('keydown', handleScrollKey);
            document.removeEventListener('scrollend', resumeScrollTracking);
            if (frame != null) view.cancelAnimationFrame(frame);
            resize?.disconnect();
            resumeScrollTracking();
        };
    }, [sections]);

    const scrollToSection = (event, id) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const document = event.currentTarget.ownerDocument;
        const section = document.getElementById(id);
        if (!section) return;
        // 일반 이동에서는 URL을 유지해 예약 수정 상태와 방문 접수 링크를 보존한다.
        event.preventDefault();
        tabScrollUntil.current = document.defaultView.performance.now() + SCROLL_IDLE_MS;
        setActive(id);
        section.focus({ preventScroll: true });
        section.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    };

    return <nav ref={navigationRef} className="reserve-discovery-top-nav reserve-store-section-nav" aria-label="가게 상세 섹션">
        <div className="reserve-discovery-top-nav-inner" style={{ '--reserve-store-section-count': sections.length }}>
            {sections.map(({ id, label }, index) => <a key={id} href={`#${id}`}
                aria-current={index === activeIndex ? 'location' : undefined} onClick={event => scrollToSection(event, id)}>{label}</a>)}
            <span className="reserve-discovery-top-nav-indicator" aria-hidden="true"
                style={{ '--reserve-store-section-index': activeIndex }} />
        </div>
    </nav>;
}

StoreDetailSectionNav.propTypes = { sections: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired, label: PropTypes.string.isRequired,
})).isRequired };
