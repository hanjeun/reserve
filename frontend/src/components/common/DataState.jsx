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
    NotificationOutlined,
    ShopOutlined,
    StarOutlined,
    SyncOutlined,
    TeamOutlined,
    WalletOutlined,
    WifiOutlined,
} from '@ant-design/icons';
import Button from './Button';
import StateIllustration from './StateIllustration';
import { fontSize, spacing } from '../../styles/tokens';
import { isMissingRequestError, listRequestErrorKind, listRequestErrorMessage } from '../../utils/listErrorMessage';

const EMPTY_ICON_BY_KIND = {
    advertisement: NotificationOutlined,
    favorite: HeartOutlined,
    mail: MailOutlined,
    member: TeamOutlined,
    message: MessageOutlined,
    news: NotificationOutlined,
    payment: WalletOutlined,
    reservation: CalendarOutlined,
    review: StarOutlined,
    store: ShopOutlined,
    waiting: ClockCircleOutlined,
};

const DATA_STATE_SIZE = {
    '--data-state-icon-size': spacing[10],
    '--data-state-title-size': fontSize['2xl'],
    '--data-state-description-size': fontSize.base,
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

/**
 * 조회 결과가 비었을 때와 조회 자체가 실패했을 때를 한 형태로 보여 주는 관문이다.
 * 폼 검증·결제 제출처럼 사용자의 입력을 다시 보내는 오류에는 쓰지 않는다.
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
    const errorImages = { forbidden: 'access-restricted', missing: 'not-found', offline: 'network-offline',
        rateLimited: 'rate-limited', retry: 'retry', unavailable: 'server-unavailable', unknown: 'unknown-error' };
    const illustration = isMissingDetail ? 'not-found' : isError ? errorImages[errorKind] ?? 'unknown-error' : `empty-${kind}`;

    return (
        <section
            className={[
                'reserve-data-state',
                compact && 'reserve-data-state--compact',
                isError && 'reserve-data-state--error',
                className,
            ].filter(Boolean).join(' ')}
            style={{ ...DATA_STATE_SIZE, ...style }}
            role={isError ? 'alert' : undefined}
            aria-live={isError ? 'assertive' : undefined}
            {...rest}
        >
            {compact ? <span className="reserve-data-state__icon" aria-hidden="true"><Icon /></span>
                : <StateIllustration name={illustration} fallback={<Icon />} interactive={!retrying} />}
            <div className="reserve-data-state__copy">
                <p className="reserve-data-state__title">{message}</p>
                {description && <p className="reserve-data-state__description">{description}</p>}
            </div>
            {action ?? (isMissingDetail ? missingAction : onRetry && (
                <Button
                    variant="ghost"
                    size="sm"
                    loading={retrying}
                    icon={<SyncOutlined />}
                    loadingIcon={<SyncOutlined spin />}
                    onClick={onRetry}
                    className="reserve-data-state__retry"
                >
                    {retryLabel}
                </Button>
            ))}
        </section>
    );
};

DataState.propTypes = {
    state: PropTypes.oneOf(['empty', 'error']),
    requestType: PropTypes.oneOf(['list', 'detail']),
    kind: PropTypes.oneOf(['advertisement', 'favorite', 'generic', 'mail', 'member', 'message', 'news', 'payment', 'reservation', 'review', 'store', 'waiting']),
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
