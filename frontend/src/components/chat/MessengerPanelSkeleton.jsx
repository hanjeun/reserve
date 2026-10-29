import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import LoadingStatus from '../common/LoadingStatus';
import ConversationListSkeleton from './ConversationListSkeleton';
import MessengerFooter from './MessengerFooter';
import MessengerThreadSkeleton from './MessengerThreadSkeleton';

const ignore = () => {};
export default function MessengerPanelSkeleton({ view, thread = false }) {
    if (thread) return <div className="reserve-messenger reserve-messenger--panel has-thread reserve-messenger-panel-skeleton">
        <LoadingStatus className="reserve-messenger-thread" aria-label="메신저를 불러오는 중" aria-busy="true">
            <header className="reserve-messenger-thread-heading"><Bone width={36} height={36} borderRadius="50%" /><Bone width="45%" height={18} /></header>
            <div className="reserve-messenger-thread-body"><MessengerThreadSkeleton /></div>
            <div className="reserve-messenger-composer-wrap"><Bone height={120} borderRadius={16} /></div>
        </LoadingStatus>
    </div>;
    return <div className="reserve-messenger reserve-messenger--panel is-home reserve-messenger-panel-skeleton">
        <LoadingStatus className={view === 'home' ? 'reserve-messenger-home' : 'reserve-messenger-settings'} aria-label="메신저를 불러오는 중" aria-busy="true">
            {view === 'home' ? <>
                <Bone height={200} borderRadius={0} />
                <div className="reserve-messenger-home-scroll">
                    <div className="reserve-messenger-welcome">
                        <div className="reserve-messenger-welcome-sender"><Bone width={40} height={40} borderRadius="50%" /><Bone width="50%" height={16} /></div>
                        <div className="reserve-messenger-panel-skeleton-copy"><Bone width="90%" height={14} /><Bone height={44} borderRadius={12} /></div>
                    </div>
                </div>
            </> : <>
                <div className="reserve-messenger-settings-heading"><Bone width="35%" height={24} /></div>
                {view === 'conversations' ? <ConversationListSkeleton /> : <div className="reserve-messenger-settings-scroll">
                    <div className="reserve-messenger-settings-profile"><Bone width={64} height={64} borderRadius="50%" /><Bone width="50%" height={16} /><Bone width="75%" height={12} /></div>
                    <div className="reserve-messenger-panel-skeleton-copy"><Bone height={18} /><Bone height={18} /><Bone height={18} /></div>
                </div>}
            </>}
        </LoadingStatus>
        <MessengerFooter view={view} disabled onChange={ignore} />
    </div>;
}
MessengerPanelSkeleton.propTypes = { view: PropTypes.oneOf(['home', 'conversations', 'settings']).isRequired, thread: PropTypes.bool };
