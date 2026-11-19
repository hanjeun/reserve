import PropTypes from 'prop-types';
import {
    CalendarOutlined,
    ClockCircleOutlined,
    CloudServerOutlined,
    ExclamationCircleOutlined,
    FileUnknownOutlined,
    HeartOutlined,
    InboxOutlined,
    LockOutlined,
    MailOutlined,
    MessageOutlined,
    BellOutlined,
    NotificationOutlined,
    ShopOutlined,
    StarOutlined,
    SyncOutlined,
    TeamOutlined,
    WalletOutlined,
    WifiOutlined,
} from './icons';
import RetryButton from './RetryButton';
import StateIllustration from './StateIllustration';
import { fontSize } from '../../styles/tokens';
import { isMissingRequestError, listRequestErrorDescription, listRequestErrorKind, listRequestErrorMessage } from '../../utils/listErrorMessage';

const EMPTY_ICON_BY_KIND = {
    advertisement: NotificationOutlined,
    comment: MessageOutlined,
    favorite: HeartOutlined,
    feed: NotificationOutlined,
    mail: MailOutlined,
    member: TeamOutlined,
    message: MessageOutlined,
    news: NotificationOutlined,
    notification: BellOutlined,
    payment: WalletOutlined,
    reservation: CalendarOutlined,
    review: StarOutlined,
    store: ShopOutlined,
    waiting: ClockCircleOutlined,
};

const ERROR_ICON_BY_KIND = {
    forbidden: LockOutlined,
    missing: FileUnknownOutlined,
    offline: WifiOutlined,
    rateLimited: ClockCircleOutlined,
    retry: SyncOutlined,
    unavailable: CloudServerOutlined,
    unknown: ExclamationCircleOutlined,
};

/*
 * 조회 빈 결과·오류를 표시하며 폼 검증·결제 제출 오류와 구분한다.
 */
const DataState = ({
    state = 'empty',
    requestType = 'list',
    kind = 'generic',
    subject,
    error,
    title,
    description,
    onRetry,
    retrying = false,
    retryLabel = '다시 불러오기',
    action,
    missingAction,
    compact = false,
    className,
    style,
    ...rest
}) => {
    const isError = state === 'error';
    const isMissingDetail = requestType === 'detail' && (!isError || isMissingRequestError(error));
    const errorKind = isError ? listRequestErrorKind(error) : null;
    const Icon = isError
        ? (ERROR_ICON_BY_KIND[errorKind] ?? ERROR_ICON_BY_KIND.unknown)
        : (EMPTY_ICON_BY_KIND[kind] ?? InboxOutlined);
    const message = title ?? (isError ? listRequestErrorMessage(error, subject ?? '목록', requestType) : '표시할 항목이 없어요.');
    const reason = isError && title ? listRequestErrorDescription(error, requestType) : undefined;
    const detail = [...new Set([reason, description].filter(Boolean))].join(' ');
    const errorImages = { forbidden: 'access-restricted', missing: 'not-found', offline: 'network-offline',
        rateLimited: 'rate-limited', retry: 'retry', unavailable: 'server-unavailable', unknown: 'unknown-error' };
    const illustration = isMissingDetail ? 'not-found' : isError ? errorImages[errorKind] ?? 'unknown-error' : `empty-${kind}`;
    const controls = action ?? (isMissingDetail ? missingAction : onRetry && (
        <RetryButton
            variant={compact ? 'ghost-sm' : 'ghost'}
            loading={retrying}
            onRetry={onRetry}
            className="reserve-data-state__retry"
        >
            {retryLabel}
        </RetryButton>
    ));

    return (
        <section
            className={[
                'reserve-data-state',
                compact && 'reserve-data-state--compact',
                isError && 'reserve-data-state--error',
                className,
            ].filter(Boolean).join(' ')}
            style={{
                '--data-state-title-size': compact ? fontSize.lg : fontSize['2xl'],
                '--data-state-description-size': compact ? fontSize.md : fontSize.base,
                ...style,
            }}
            role={isError ? 'alert' : undefined}
            aria-live={isError ? 'assertive' : undefined}
            {...rest}
        >
            <span className="reserve-data-state__illustration">
                <StateIllustration name={illustration} size={compact ? 'sm' : 'md'} fallback={<Icon />} interactive={!retrying} />
            </span>
            <div className="reserve-data-state__body">
                <div className="reserve-data-state__copy">
                    <p className="reserve-data-state__title">{message}</p>
                    {detail && <p className="reserve-data-state__description">{detail}</p>}
                </div>
                {controls && <div className="reserve-data-state__actions">{controls}</div>}
            </div>
        </section>
    );
};

DataState.propTypes = {
    state: PropTypes.oneOf(['empty', 'error']),
    requestType: PropTypes.oneOf(['list', 'detail']),
    kind: PropTypes.oneOf(['advertisement', 'comment', 'favorite', 'feed', 'generic', 'mail', 'member', 'message', 'news', 'notification', 'payment', 'reservation', 'review', 'store', 'waiting']),
    subject: PropTypes.string,
    // Axios 오류뿐 아니라 훅이 정규화한 문자열도 받을 수 있다.
    error: PropTypes.any,
    title: PropTypes.string,
    description: PropTypes.string,
    onRetry: PropTypes.func,
    retrying: PropTypes.bool,
    retryLabel: PropTypes.string,
    action: PropTypes.node,
    missingAction: PropTypes.node,
    compact: PropTypes.bool,
    className: PropTypes.string,
    style: PropTypes.object,
};

export default DataState;
