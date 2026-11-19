import PropTypes from 'prop-types';

const particles = Array.from({ length: 18 }, (_, index) => ({
    left: `${3 + index * 29 % 93}%`,
    '--season-height': `${12 + index * 11 % 76}%`,
    '--season-size': `${6 + index * 5 % 7}px`,
    '--season-drift': `${index * 17 % 57 - 28}px`,
    '--season-turn': `${(index % 2 ? -1 : 1) * (100 + index * 23 % 220)}deg`,
    '--season-duration': `${11 + index * 3 % 13}s`,
    '--season-delay': `${-(index * 7 % 19)}s`,
}));

export default function SeasonParticles({ season }) {
    return <div className={`reserve-season-particles reserve-season-particles--${season}`}>
        {particles.map(style => <span key={style.left} style={style} />)}
    </div>;
}

SeasonParticles.propTypes = { season: PropTypes.oneOf(['spring', 'summer', 'autumn']).isRequired };
