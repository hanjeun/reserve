import { LINES, fullText } from '../../typing';
import TypingLine from '../../TypingLine';
import BounceArrow from './BounceArrow';
import FeatureSection from './FeatureSection';
import { BOOKING_HANDOFF } from '../Home.constants';

export default function HeroSection({ heroVideo, isMobile }) {
    const video = heroVideo?.[isMobile ? 'mobile' : 'desktop'];
    return <section id={video ? 'section-0' : 'section-top'} className={`marketing-scene marketing-hero${video ? ' marketing-hero--film marketing-hero--composed' : ''}`} data-hero-story={video ? 'true' : undefined}
        data-hero-frame={video ? JSON.stringify({ width: video.width, height: video.height, frame: video.frame }) : undefined}>
        <div className="marketing-hero-stage">
        {video && <div className="marketing-hero-film" aria-hidden="true">
            <video src={video.idle} poster={video.poster} width={video.width} height={video.height} muted loop playsInline preload="none" disablePictureInPicture tabIndex={-1} data-hero-idle />
            <video src={video.src} poster={video.poster} width={video.width} height={video.height} muted playsInline preload="none" disablePictureInPicture tabIndex={-1} data-hero-video />
        </div>}
        <div className="marketing-hero-content">
            <h1 className="marketing-hero-title slide-up" aria-label="예약이 필요한 순간, RESERVE">
                <span>예약이 필요한 순간,</span>
                <span data-marketing-typing className="marketing-hero-typing">
                    {LINES.map((line, index) => <span key={index} className="marketing-typing-measure" aria-hidden="true">{fullText(line)}<span className="cursor" /></span>)}
                    <TypingLine line={LINES[0]} />
                </span>
            </h1>
            <div className="marketing-hero-actions slide-up">
                <a data-app-path="/stores" className="marketing-hero-arrow" aria-label="가게 둘러보기">
                    <svg width="76" height="48" viewBox="0 0 76 48" fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                        <path d="M 6 24 H 69 M 62 17 L 69 24 L 62 31" />
                    </svg>
                </a>
            </div>
        </div>
        {video && <div className="marketing-hero-handoff" data-hero-handoff inert aria-hidden="true"><FeatureSection sec={BOOKING_HANDOFF} index={1} embedded /></div>}
        <BounceArrow targetId={video ? BOOKING_HANDOFF.id : 'section-0'} style={{ position: 'absolute', bottom: 16, left: 0, right: 0 }} />
        </div>
        {video && <div className="marketing-hero-landing" aria-hidden="true" />}
    </section>;
}
