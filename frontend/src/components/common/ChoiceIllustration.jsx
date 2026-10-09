import PropTypes from 'prop-types';
import industryIllustration from '../../assets/service-domains/popup-512.webp?url&no-inline';

const files = import.meta.glob('../../assets/choice-icons/*-512.webp', { eager: true, query: '?url&no-inline', import: 'default' });
const sources = {
    ...Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split('/').pop().replace('-512.webp', ''), url])),
    'edit-industry': industryIllustration,
};

export default function ChoiceIllustration({ name, fallback }) {
    const src = sources[name];
    return src ? <img src={src} width={56} height={56} alt="" draggable={false} decoding="async"
        style={{ display: 'block', width: 56, height: 56, objectFit: 'contain', transformOrigin: '50% 55%' }} /> : fallback;
}
ChoiceIllustration.propTypes = { name: PropTypes.string, fallback: PropTypes.node };
