import { createElement, forwardRef } from 'react';
import PropTypes from 'prop-types';
import SvgIcon from './SvgIcon';
import {
    GridGlyph, ArrowLeftGlyph, ArrowRightGlyph, AuditGlyph, ChartGlyph, BellGlyph, CalendarGlyph, CameraGlyph,
    CheckCircleGlyph, CheckCircleFilledGlyph, CheckGlyph, ClockGlyph, CloseCircleFilledGlyph, CloseGlyph, ServerGlyph,
    CommentGlyph, CopyGlyph, CardGlyph, HeadsetGlyph, DeleteGlyph, DesktopGlyph, DollarGlyph, DoubleLeftGlyph,
    DoubleRightGlyph, DownloadGlyph, DownGlyph, EditGlyph, PinGlyph, WarningCircleGlyph, WarningCircleFilledGlyph,
    EyeOffGlyph, EyeGlyph, FileGlyph, UnknownFileGlyph, FlagGlyph, GlobeGlyph, HeartGlyph, HomeGlyph, HourglassGlyph,
    IdentityGlyph, InboxGlyph, InfoGlyph, LeftGlyph, LockGlyph, LogoutGlyph, MailGlyph, MinusGlyph, MobileGlyph,
    MoonGlyph, MoreGlyph, SpeakerGlyph, HashGlyph, PaperclipGlyph, PartitionGlyph, PauseGlyph, PhoneGlyph,
    PictureGlyph, PlusGlyph, ProfileGlyph, QrGlyph, BookGlyph, ReloadGlyph, RightGlyph, RollbackGlyph, ShieldGlyph,
    ScheduleGlyph, SearchGlyph, SendGlyph, SettingsGlyph, StoreGlyph, SmileGlyph, StarGlyph, StopGlyph, SunGlyph,
    SyncGlyph, TeamGlyph, LightningGlyph, UndoGlyph, UnlockGlyph, ListGlyph, UploadGlyph, UserGlyph, WalletGlyph,
    WarningGlyph, WifiGlyph, MenuGlyph, FolderGlyph,
} from './IconGlyphs';

// 기존 앱 호출부의 span/ref/접근성/회전/이벤트 계약을 유지하는 공통 아이콘 관문.
const createIcon = (type, glyph, filled = false) => {
    const label = type.replace(/(?:Outlined|Filled)$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const Icon = forwardRef(({ className, spin = false, rotate, tabIndex, onClick, twoToneColor: _twoToneColor, ...rest }, ref) => {
        void _twoToneColor; // AntD compatibility prop must not reach the DOM.
        return createElement('span', { role: 'img', 'aria-label': label, ...rest, ref, onClick,
            tabIndex: tabIndex ?? (onClick ? -1 : undefined),
            className: ['anticon', `anticon-${label}`, 'reserve-ui-icon', spin && 'anticon-spin', className].filter(Boolean).join(' '),
        }, createElement(SvgIcon, { glyph, filled, style: rotate == null ? undefined : { transform: `rotate(${rotate}deg)` } }));
    });
    Icon.displayName = type;
    Icon.propTypes = { className: PropTypes.string, spin: PropTypes.bool, rotate: PropTypes.number,
        tabIndex: PropTypes.number, onClick: PropTypes.func, twoToneColor: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]) };
    return Icon;
};

export const AppstoreOutlined = /*#__PURE__*/createIcon('AppstoreOutlined', GridGlyph);
export const ArrowLeftOutlined = /*#__PURE__*/createIcon('ArrowLeftOutlined', ArrowLeftGlyph);
export const ArrowRightOutlined = /*#__PURE__*/createIcon('ArrowRightOutlined', ArrowRightGlyph);
export const AuditOutlined = /*#__PURE__*/createIcon('AuditOutlined', AuditGlyph);
export const BarChartOutlined = /*#__PURE__*/createIcon('BarChartOutlined', ChartGlyph);
export const BellOutlined = /*#__PURE__*/createIcon('BellOutlined', BellGlyph);
export const FolderOutlined = /*#__PURE__*/createIcon('FolderOutlined', FolderGlyph);
export const CalendarOutlined = /*#__PURE__*/createIcon('CalendarOutlined', CalendarGlyph);
export const CameraOutlined = /*#__PURE__*/createIcon('CameraOutlined', CameraGlyph);
export const CheckCircleFilled = /*#__PURE__*/createIcon('CheckCircleFilled', CheckCircleFilledGlyph);
export const CheckCircleOutlined = /*#__PURE__*/createIcon('CheckCircleOutlined', CheckCircleGlyph);
export const CheckOutlined = /*#__PURE__*/createIcon('CheckOutlined', CheckGlyph);
export const ClockCircleOutlined = /*#__PURE__*/createIcon('ClockCircleOutlined', ClockGlyph);
export const CloseCircleFilled = /*#__PURE__*/createIcon('CloseCircleFilled', CloseCircleFilledGlyph);
export const CloseOutlined = /*#__PURE__*/createIcon('CloseOutlined', CloseGlyph);
export const CloudServerOutlined = /*#__PURE__*/createIcon('CloudServerOutlined', ServerGlyph);
export const CommentOutlined = /*#__PURE__*/createIcon('CommentOutlined', CommentGlyph);
export const CopyOutlined = /*#__PURE__*/createIcon('CopyOutlined', CopyGlyph);
export const CreditCardOutlined = /*#__PURE__*/createIcon('CreditCardOutlined', CardGlyph);
export const CustomerServiceOutlined = /*#__PURE__*/createIcon('CustomerServiceOutlined', HeadsetGlyph);
export const DeleteOutlined = /*#__PURE__*/createIcon('DeleteOutlined', DeleteGlyph);
export const DesktopOutlined = /*#__PURE__*/createIcon('DesktopOutlined', DesktopGlyph);
export const DollarOutlined = /*#__PURE__*/createIcon('DollarOutlined', DollarGlyph);
export const DoubleLeftOutlined = /*#__PURE__*/createIcon('DoubleLeftOutlined', DoubleLeftGlyph);
export const DoubleRightOutlined = /*#__PURE__*/createIcon('DoubleRightOutlined', DoubleRightGlyph);
export const DownloadOutlined = /*#__PURE__*/createIcon('DownloadOutlined', DownloadGlyph);
export const DownOutlined = /*#__PURE__*/createIcon('DownOutlined', DownGlyph);
export const EditOutlined = /*#__PURE__*/createIcon('EditOutlined', EditGlyph);
export const EnvironmentOutlined = /*#__PURE__*/createIcon('EnvironmentOutlined', PinGlyph);
export const ExclamationCircleFilled = /*#__PURE__*/createIcon('ExclamationCircleFilled', WarningCircleFilledGlyph);
export const ExclamationCircleOutlined = /*#__PURE__*/createIcon('ExclamationCircleOutlined', WarningCircleGlyph);
export const EyeInvisibleOutlined = /*#__PURE__*/createIcon('EyeInvisibleOutlined', EyeOffGlyph);
export const EyeOutlined = /*#__PURE__*/createIcon('EyeOutlined', EyeGlyph);
export const FieldTimeOutlined = /*#__PURE__*/createIcon('FieldTimeOutlined', ClockGlyph);
export const FileTextOutlined = /*#__PURE__*/createIcon('FileTextOutlined', FileGlyph);
export const FileUnknownOutlined = /*#__PURE__*/createIcon('FileUnknownOutlined', UnknownFileGlyph);
export const FlagOutlined = /*#__PURE__*/createIcon('FlagOutlined', FlagGlyph);
export const GlobalOutlined = /*#__PURE__*/createIcon('GlobalOutlined', GlobeGlyph);
export const HeartFilled = /*#__PURE__*/createIcon('HeartFilled', HeartGlyph, true);
export const HeartOutlined = /*#__PURE__*/createIcon('HeartOutlined', HeartGlyph);
export const HomeOutlined = /*#__PURE__*/createIcon('HomeOutlined', HomeGlyph);
export const HourglassOutlined = /*#__PURE__*/createIcon('HourglassOutlined', HourglassGlyph);
export const IdcardOutlined = /*#__PURE__*/createIcon('IdcardOutlined', IdentityGlyph);
export const InboxOutlined = /*#__PURE__*/createIcon('InboxOutlined', InboxGlyph);
export const InfoCircleOutlined = /*#__PURE__*/createIcon('InfoCircleOutlined', InfoGlyph);
export const LeftOutlined = /*#__PURE__*/createIcon('LeftOutlined', LeftGlyph);
export const LockOutlined = /*#__PURE__*/createIcon('LockOutlined', LockGlyph);
export const LogoutOutlined = /*#__PURE__*/createIcon('LogoutOutlined', LogoutGlyph);
export const MailOutlined = /*#__PURE__*/createIcon('MailOutlined', MailGlyph);
export const MessageOutlined = /*#__PURE__*/createIcon('MessageOutlined', CommentGlyph);
export const MinusOutlined = /*#__PURE__*/createIcon('MinusOutlined', MinusGlyph);
export const MobileOutlined = /*#__PURE__*/createIcon('MobileOutlined', MobileGlyph);
export const MoonOutlined = /*#__PURE__*/createIcon('MoonOutlined', MoonGlyph);
export const MoreOutlined = /*#__PURE__*/createIcon('MoreOutlined', MoreGlyph);
export const NotificationOutlined = /*#__PURE__*/createIcon('NotificationOutlined', SpeakerGlyph);
export const NumberOutlined = /*#__PURE__*/createIcon('NumberOutlined', HashGlyph);
export const PaperClipOutlined = /*#__PURE__*/createIcon('PaperClipOutlined', PaperclipGlyph);
export const PartitionOutlined = /*#__PURE__*/createIcon('PartitionOutlined', PartitionGlyph);
export const PauseCircleOutlined = /*#__PURE__*/createIcon('PauseCircleOutlined', PauseGlyph);
export const PhoneOutlined = /*#__PURE__*/createIcon('PhoneOutlined', PhoneGlyph);
export const PictureOutlined = /*#__PURE__*/createIcon('PictureOutlined', PictureGlyph);
export const PlusOutlined = /*#__PURE__*/createIcon('PlusOutlined', PlusGlyph);
export const ProfileOutlined = /*#__PURE__*/createIcon('ProfileOutlined', ProfileGlyph);
export const QrcodeOutlined = /*#__PURE__*/createIcon('QrcodeOutlined', QrGlyph);
export const ReadOutlined = /*#__PURE__*/createIcon('ReadOutlined', BookGlyph);
export const ReloadOutlined = /*#__PURE__*/createIcon('ReloadOutlined', ReloadGlyph);
export const RightOutlined = /*#__PURE__*/createIcon('RightOutlined', RightGlyph);
export const RollbackOutlined = /*#__PURE__*/createIcon('RollbackOutlined', RollbackGlyph);
export const SafetyCertificateOutlined = /*#__PURE__*/createIcon('SafetyCertificateOutlined', ShieldGlyph);
export const ScheduleOutlined = /*#__PURE__*/createIcon('ScheduleOutlined', ScheduleGlyph);
export const SearchOutlined = /*#__PURE__*/createIcon('SearchOutlined', SearchGlyph);
export const SendOutlined = /*#__PURE__*/createIcon('SendOutlined', SendGlyph);
export const SettingOutlined = /*#__PURE__*/createIcon('SettingOutlined', SettingsGlyph);
export const ShopOutlined = /*#__PURE__*/createIcon('ShopOutlined', StoreGlyph);
export const SmileOutlined = /*#__PURE__*/createIcon('SmileOutlined', SmileGlyph);
export const StarFilled = /*#__PURE__*/createIcon('StarFilled', StarGlyph, true);
export const StarOutlined = /*#__PURE__*/createIcon('StarOutlined', StarGlyph);
export const StopOutlined = /*#__PURE__*/createIcon('StopOutlined', StopGlyph);
export const SunOutlined = /*#__PURE__*/createIcon('SunOutlined', SunGlyph);
export const SyncOutlined = /*#__PURE__*/createIcon('SyncOutlined', SyncGlyph);
export const TeamOutlined = /*#__PURE__*/createIcon('TeamOutlined', TeamGlyph);
export const ThunderboltOutlined = /*#__PURE__*/createIcon('ThunderboltOutlined', LightningGlyph);
export const UndoOutlined = /*#__PURE__*/createIcon('UndoOutlined', UndoGlyph);
export const UnlockOutlined = /*#__PURE__*/createIcon('UnlockOutlined', UnlockGlyph);
export const UnorderedListOutlined = /*#__PURE__*/createIcon('UnorderedListOutlined', ListGlyph);
export const MenuOutlined = /*#__PURE__*/createIcon('MenuOutlined', MenuGlyph);
export const UploadOutlined = /*#__PURE__*/createIcon('UploadOutlined', UploadGlyph);
export const UserOutlined = /*#__PURE__*/createIcon('UserOutlined', UserGlyph);
export const WalletOutlined = /*#__PURE__*/createIcon('WalletOutlined', WalletGlyph);
export const WarningOutlined = /*#__PURE__*/createIcon('WarningOutlined', WarningGlyph);
export const WifiOutlined = /*#__PURE__*/createIcon('WifiOutlined', WifiGlyph);
