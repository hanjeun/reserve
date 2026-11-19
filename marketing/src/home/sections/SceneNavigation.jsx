import { SECTIONS } from '../Home.constants';

export default function SceneNavigation({ firstFeature = 0 }) {
    const sections = [{ id: firstFeature ? 'section-0' : 'section-top', tag: '처음' }, ...SECTIONS.slice(firstFeature), { id: 'section-faq', tag: '자주 묻는 질문' }];
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
