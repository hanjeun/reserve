import { colors } from '../../frontend/src/styles/tokens/index.js';
import { fullText } from './typing';

export default function TypingLine({ line, reserveSpace = false }) {
    return <span data-typing-line aria-hidden="true" className={reserveSpace ? 'marketing-typing-line' : undefined}>
        {reserveSpace && <span className="marketing-typing-measure">{fullText(line)}<span className="cursor" /></span>}
        <span className="marketing-typing-text">
            <span data-typing-before>{line.before}</span>
            <span data-typing-blue style={{ color: colors.primary.main }}>{line.blue}</span>
            <span data-typing-after>{line.after}</span>
            <span className={`cursor${reserveSpace ? ' marketing-section-cursor' : ''}`} />
        </span>
    </span>;
}
