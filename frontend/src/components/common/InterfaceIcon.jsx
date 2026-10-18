import PropTypes from 'prop-types';
import SvgIcon from './SvgIcon';
import {
    HeartGlyph, CommentGlyph, SendGlyph, MoreGlyph, ComposeGlyph, EditGlyph, DeleteGlyph, FlagGlyph,
    StoreGlyph, CalendarGlyph, ClockGlyph, SpeakerGlyph, PinGlyph, FolderGlyph, DownGlyph, LeftGlyph, RightGlyph, PlusGlyph,
} from './IconGlyphs';

const glyphs = {
    heart: HeartGlyph, comment: CommentGlyph, share: SendGlyph, more: MoreGlyph, compose: ComposeGlyph,
    edit: EditGlyph, delete: DeleteGlyph, report: FlagGlyph, store: StoreGlyph, calendar: CalendarGlyph,
    clock: ClockGlyph, notification: SpeakerGlyph, map: PinGlyph, folder: FolderGlyph,
    chevronDown: DownGlyph, chevronLeft: LeftGlyph, chevronRight: RightGlyph, plus: PlusGlyph,
};

export default function InterfaceIcon({ name, filled = false, className, ...rest }) {
    return <SvgIcon {...rest} glyph={glyphs[name]} filled={filled} className={['anticon', className].filter(Boolean).join(' ')} />;
}
InterfaceIcon.propTypes = { name: PropTypes.oneOf(Object.keys(glyphs)).isRequired, filled: PropTypes.bool, className: PropTypes.string };
