import { Typography } from '../../primitives';
import TypingLine from '../../TypingLine';
import { splitLine } from '../../typing';
import MarketingPhone from './MarketingPhone';

const { Title } = Typography;

export default function FeatureSection({ sec, index, embedded = false }) {
    const { id, tag, title, blue, demo, reverse } = sec;
    return <section className={`${embedded ? 'marketing-feature--embedded' : 'marketing-scene'} marketing-feature${reverse ? ' is-reversed' : ''}`} id={id} data-scene-index={index}>
        <div className="marketing-feature-inner">
            <div className={`marketing-feature-copy${embedded ? '' : ' reveal'}`}>
                <Title level={2} className="marketing-feature-title" data-marketing-section-title aria-label={title.join(' ')}>
                    {title.map((line, lineIndex) => <TypingLine key={lineIndex} line={splitLine(line, blue)} reserveSpace />)}
                </Title>
            </div>
            <div className={`marketing-feature-media${embedded ? '' : ' reveal reveal-delayed'}`}>
                <MarketingPhone label={tag} scene={demo} />
            </div>
        </div>
    </section>;
}
