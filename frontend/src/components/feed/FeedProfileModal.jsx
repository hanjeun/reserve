import { lazy, Suspense, useState } from 'react';
import PropTypes from 'prop-types';
import EditorDialog from '../common/EditorDialog';
import EditorLoading from './EditorLoading';

const FeedProfileForm = lazy(() => import('./FeedProfileForm'));

export default function FeedProfileModal({ open, profile, onClose, onSaved }) {
    const [session, setSession] = useState({ open, number: 0 });
    const current = session.open === open ? session : { open, number: session.number + (open ? 1 : 0) };
    if (current !== session) setSession(current);
    return <EditorDialog title="공개 프로필 수정" open={open} onClose={onClose}>
        <Suspense fallback={<EditorLoading />}><FeedProfileForm key={current.number} open={open} profile={profile} onClose={onClose} onSaved={onSaved} /></Suspense>
    </EditorDialog>;
}
FeedProfileModal.propTypes = { open: PropTypes.bool.isRequired, profile: PropTypes.object,
    onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired };
