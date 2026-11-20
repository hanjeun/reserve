import { BOOKING_HANDOFF } from '../Home.constants';

export default function SceneNavigation({ features, hasHeroVideo }) {
    const sections = [
        { id: hasHeroVideo ? 'section-0' : 'section-top', tag: '처음' },
        ...(hasHeroVideo ? [BOOKING_HANDOFF] : []),
        ...features,
        { id: 'section-faq', tag: '자주 묻는 질문' },
    ];
    return <>
        <nav className="marketing-scene-navigation" aria-label="소개 단계" data-marketing-scene-nav>
            {sections.map(section => <button type="button" key={section.id} data-scroll-target={section.id}
                aria-label={section.tag} data-marketing-tooltip={section.tag} data-tooltip-placement="left"><span aria-hidden="true" /></button>)}
        </nav>
        <div className="marketing-scene-indicator" aria-hidden="true" data-marketing-scene-nav>
            {sections.map(section => <span key={section.id} data-scene-mark={section.id} />)}
        </div>
    </>;
}
