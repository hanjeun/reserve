import PropTypes from 'prop-types';

// 24 좌표, 둥근 끝/연결의 공통 UI 그림. 개별 export로 사용하지 않는 아이콘은 번들에서 제외한다.
export function GridGlyph() { return <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>; }
export function ArrowLeftGlyph() { return <path d="M20 12H4m7-7-7 7 7 7" />; }
export function ArrowRightGlyph() { return <path d="M4 12h16m-7-7 7 7-7 7" />; }
export function AuditGlyph() { return <><rect x="5" y="4" width="14" height="17" rx="3" /><rect x="9" y="2" width="6" height="4" rx="1.5" /><path d="m8 13 3 3 5-6" /></>; }
export function ChartGlyph() { return <><path d="M4 3v18h17M8 16v-5M13 16V7M18 16V4" /></>; }
export function BellGlyph() { return <><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8ZM10 21h4" /></>; }
export function CalendarGlyph() { return <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" /></>; }
export function CameraGlyph() { return <><path d="M8 5 9.5 3h5L16 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3Z" /><circle cx="12" cy="13" r="4" /></>; }
export function CheckCircleGlyph() { return <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>; }
export function CheckCircleFilledGlyph() { return <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="m7.5 12 3 3 6-6" stroke="var(--c-bg-default, #fff)" /></>; }
export function CheckGlyph() { return <path d="m4 12 5 5L20 6" />; }
export function ClockGlyph() { return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>; }
export function CloseCircleFilledGlyph() { return <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="m8 8 8 8M16 8l-8 8" stroke="var(--c-bg-default, #fff)" /></>; }
export function CloseGlyph() { return <path d="m5 5 14 14M19 5 5 19" />; }
export function ServerGlyph() { return <><rect x="3" y="3" width="18" height="7" rx="2.5" /><rect x="3" y="14" width="18" height="7" rx="2.5" /><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6" /></>; }
export function CommentGlyph() { return <path d="M20.6 16.3a8.8 8.8 0 1 0-4.5 4.3l4 .8a.8.8 0 0 0 1-.9l-.5-4.2Z" />; }
export function CopyGlyph() { return <><rect x="8" y="8" width="13" height="13" rx="3" /><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></>; }
export function CardGlyph() { return <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M7 15h4" /></>; }
export function HeadsetGlyph() { return <><path d="M4 13v-2a8 8 0 0 1 16 0v6a4 4 0 0 1-4 4h-3" /><rect x="3" y="11" width="4" height="7" rx="2" /><rect x="17" y="11" width="4" height="7" rx="2" /></>; }
export function DeleteGlyph() { return <path d="M3.5 6h17M9 6V3.5h6V6M5.5 6l.8 13a2 2 0 0 0 2 2h7.4a2 2 0 0 0 2-2l.8-13M10 10v7M14 10v7" />; }
export function DesktopGlyph() { return <><rect x="2" y="3" width="20" height="14" rx="3" /><path d="M12 17v4M8 21h8" /></>; }
export function DollarGlyph() { return <><path d="M12 2v20M17 6H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6" /></>; }
export function DoubleLeftGlyph() { return <path d="m11 6-6 6 6 6m8-12-6 6 6 6" />; }
export function DoubleRightGlyph() { return <path d="m5 6 6 6-6 6m8-12 6 6-6 6" />; }
export function DownloadGlyph() { return <path d="M12 3v12m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />; }
export function DownGlyph() { return <path d="m6 9 6 6 6-6" />; }
export function EditGlyph() { return <><path d="m5 16 1-4L16.4 1.6a2.1 2.1 0 0 1 3 3L9 15l-4 1Z" /><path d="m14.6 3.4 3 3M4 21h16" /></>; }
export function PinGlyph() { return <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>; }
export function WarningCircleGlyph() { return <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>; }
export function WarningCircleFilledGlyph() { return <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="M12 6.5v6M12 17h.01" stroke="var(--c-bg-default, #fff)" /></>; }
export function EyeGlyph() { return <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>; }
export function EyeOffGlyph() { return <><path d="m3 3 18 18M9.5 5.3A11 11 0 0 1 12 5c6 0 10 7 10 7a21 21 0 0 1-3.2 3.8M6 6.5A22 22 0 0 0 2 12s4 7 10 7a11 11 0 0 0 5.5-1.5M10 10a3 3 0 0 0 4 4" /></>; }
export function FileGlyph() { return <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M8 13h8M8 17h5" /></>; }
export function UnknownFileGlyph() { return <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M10 12a2 2 0 0 1 4 0c0 1-2 1-2 3M12 18h.01" /></>; }
export function FlagGlyph() { return <path d="M5 21V4c4-3 8 3 14 0v11c-6 3-10-3-14 0" />; }
export function GlobeGlyph() { return <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></>; }
export function HeartGlyph({ filled }) { return <path fill={filled ? 'currentColor' : 'none'} d="M12 20.3C8.8 18.2 3 14.4 3 9.2A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 9 2.2c0 5.2-5.8 9-9 11.1Z" />; }
export function HomeGlyph() { return <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" /></>; }
export function HourglassGlyph() { return <path d="M6 3h12M6 21h12M7 3v4c0 3 5 5 5 5s5-2 5-5V3M7 21v-4c0-3 5-5 5-5s5 2 5 5v4" />; }
export function IdentityGlyph() { return <><rect x="2" y="5" width="20" height="15" rx="3" /><circle cx="8" cy="10" r="2" /><path d="M5 16a3 3 0 0 1 6 0M14 10h4M14 14h4" /></>; }
export function InboxGlyph() { return <><path d="m3 12 3-8h12l3 8v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7ZM3 12h5l2 4h4l2-4h5" /></>; }
export function InfoGlyph() { return <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>; }
export function LeftGlyph() { return <path d="m15 6-6 6 6 6" />; }
export function LockGlyph() { return <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>; }
export function LogoutGlyph() { return <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M10 12h11m-5-5 5 5-5 5" /></>; }
export function MailGlyph() { return <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 6 8 7 8-7" /></>; }
export function MinusGlyph() { return <path d="M4 12h16" />; }
export function MobileGlyph() { return <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 5h4M11 19h2" /></>; }
export function MoonGlyph() { return <path d="M21 13.2A9 9 0 0 1 10.8 3a9 9 0 1 0 10.2 10.2Z" />; }
export function MoreGlyph() { return <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>; }
export function SpeakerGlyph() { return <path d="M4 11v3h4l10 5V5L8 10H5a1 1 0 0 0-1 1ZM8 14l1 6h3l-1-5M21 9v6" />; }
export function HashGlyph() { return <path d="M10 3 7 21M17 3l-3 18M4 9h17M3 15h17" />; }
export function PaperclipGlyph() { return <path d="m9 16 8-8a3 3 0 0 0-4-4L4 13a5 5 0 0 0 7 7l9-9M8 14l7-7" />; }
export function PartitionGlyph() { return <><rect x="8" y="2" width="8" height="6" rx="1.5" /><rect x="2" y="16" width="8" height="6" rx="1.5" /><rect x="14" y="16" width="8" height="6" rx="1.5" /><path d="M12 8v4M6 16v-4h12v4" /></>; }
export function PauseGlyph() { return <><circle cx="12" cy="12" r="9" /><path d="M9 8v8M15 8v8" /></>; }
export function PhoneGlyph() { return <path d="m8 3 2 5-3 2a16 16 0 0 0 7 7l2-3 5 2v3a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2h3Z" />; }
export function PictureGlyph() { return <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 6" /></>; }
export function PlusGlyph() { return <path d="M12 4v16M4 12h16" />; }
export function ProfileGlyph() { return <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="9" r="2" /><path d="M5 16a3 3 0 0 1 6 0M14 8h4M14 12h4M14 16h4" /></>; }
export function QrGlyph() { return <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><path d="M15 15h3v3h3v3h-6v-3M3 12h3M12 3v3M9 12h6M12 9v6M12 18v3M21 12v3" /></>; }
export function BookGlyph() { return <><path d="M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z" /></>; }
export function ReloadGlyph() { return <><path d="M20 9a8 8 0 1 0 .3 5M20 3v6h-6" /></>; }
export function RightGlyph() { return <path d="m9 6 6 6-6 6" />; }
export function RollbackGlyph() { return <path d="m9 4-6 6 6 6M3 10h11a6 6 0 0 1 0 12" />; }
export function ShieldGlyph() { return <><path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z" /><path d="m8 11 3 3 5-6" /></>; }
export function ScheduleGlyph() { return <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 11h18m-14 5 3 2 5-4" /></>; }
export function SearchGlyph() { return <><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></>; }
export function SendGlyph() { return <><path d="m4.3 3.5 16.1 7.4c1 .5 1 1.7 0 2.2L4.3 20.5c-.9.4-1.7-.3-1.4-1.2l2.1-6a4 4 0 0 0 0-2.6l-2.1-6c-.3-.9.5-1.6 1.4-1.2Z" /><path d="M5.3 12H16" /></>; }
export function SettingsGlyph() { return <><path d="m9 3-.7 2.3-2 .9-2.2-.5-1.5 2.6 1.5 1.8-.2 2.3-1.5 1.7 1.5 2.6 2.3-.4 1.9 1 .7 2.4h3l.7-2.4 1.9-1 2.3.4 1.5-2.6-1.5-1.7.2-2.3 1.5-1.8-1.5-2.6-2.2.5-2-.9L12 3H9Z" transform="translate(1.5 1)" /><circle cx="12" cy="12" r="3" /></>; }
export function StoreGlyph() { return <><path d="M4 10v10h16V10M3 10l2-7h14l2 7M3 10c0 3 4.5 3 4.5 0 0 3 4.5 3 4.5 0 0 3 4.5 3 4.5 0 0 3 4.5 3 4.5 0M9 20v-6h6v6" /></>; }
export function SmileGlyph() { return <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M16 9h.01M8 14a4 4 0 0 0 8 0" /></>; }
export function StarGlyph({ filled }) { return <path fill={filled ? 'currentColor' : 'none'} d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9 2.8-5.8Z" />; }
export function StopGlyph() { return <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>; }
export function SunGlyph() { return <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>; }
export function SyncGlyph() { return <path d="M20 8a8 8 0 0 0-14-3L3 8m0-6v6h6M4 16a8 8 0 0 0 14 3l3-3m0 6v-6h-6" />; }
export function TeamGlyph() { return <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 3a4 4 0 0 1 0 8M19 14a6 6 0 0 1 3 5v2" /></>; }
export function LightningGlyph() { return <path d="m14 2-11 12h8l-1 8 11-12h-8l1-8Z" />; }
export function UndoGlyph() { return <path d="m9 4-6 6 6 6M3 10h11a6 6 0 0 1 0 12" />; }
export function UnlockGlyph() { return <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3" /></>; }
export function ListGlyph() { return <path d="M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01" />; }
export function MenuGlyph() { return <path d="M3 5h18M3 12h18M3 19h18" />; }
export function UploadGlyph() { return <path d="M12 16V3m-5 5 5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />; }
export function UserGlyph() { return <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>; }
export function WalletGlyph() { return <><path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h13a2 2 0 0 0 2-2v-3M2 6c0 1 1 2 3 2h15v8h-5a4 4 0 0 1 0-8M15 12h.01" /></>; }
export function WarningGlyph() { return <><path d="m10.3 3.5-8.8 15A1.7 1.7 0 0 0 3 21h18a1.7 1.7 0 0 0 1.5-2.5l-8.8-15a2 2 0 0 0-3.4 0ZM12 8v5M12 17h.01" /></>; }
export function WifiGlyph() { return <><path d="M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 20h.01" /></>; }
export function ComposeGlyph() { return <><path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-6" /><path d="m9 15 1-4L18.4 2.6a2.1 2.1 0 0 1 3 3L13 14l-4 1Z" /><path d="m16.6 4.4 3 3" /></>; }
export function FolderGlyph() { return <path d="M3 7V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />; }
HeartGlyph.propTypes = { filled: PropTypes.bool };
StarGlyph.propTypes = { filled: PropTypes.bool };
