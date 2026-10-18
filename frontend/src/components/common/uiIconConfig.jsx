import {
    CheckOutlined, CheckCircleFilled, CloseOutlined, CloseCircleFilled, DownOutlined, EyeOutlined, EyeInvisibleOutlined,
    ExclamationCircleFilled, InfoCircleOutlined, MoreOutlined, PlusOutlined, SearchOutlined,
} from './icons';

const close = <CloseOutlined aria-hidden="true" />;
const statuses = {
    infoIcon: <InfoCircleOutlined aria-hidden="true" />,
    successIcon: <CheckCircleFilled aria-hidden="true" />,
    errorIcon: <CloseCircleFilled aria-hidden="true" />,
    warningIcon: <ExclamationCircleFilled aria-hidden="true" />,
};

// AntD가 내부에서 만드는 기본 아이콘도 앱 아이콘과 같은 관문을 사용한다.
export const uiIconConfig = {
    modal: { closeIcon: close, ...statuses },
    drawer: { closeIcon: close },
    notification: { closeIcon: close },
    alert: { closeIcon: close, ...statuses },
    // 아이콘만 지정해도 AntD 6은 닫기를 활성화한다. 상태 표시는 기본적으로 지울 수 없어야 한다.
    tag: { closable: false, closeIcon: close },
    tabs: { moreIcon: <MoreOutlined aria-hidden="true" />, addIcon: <PlusOutlined aria-hidden="true" />, removeIcon: close },
    select: {
        suffixIcon: <DownOutlined aria-hidden="true" />,
        clearIcon: <CloseCircleFilled aria-hidden="true" />,
        removeIcon: close,
        menuItemSelectedIcon: <CheckOutlined aria-hidden="true" />,
    },
    inputPassword: { iconRender: visible => visible ? <EyeOutlined aria-hidden="true" /> : <EyeInvisibleOutlined aria-hidden="true" /> },
    inputSearch: { searchIcon: <SearchOutlined aria-hidden="true" /> },
    image: { preview: { closeIcon: <CloseOutlined aria-label="사진 확대 닫기" /> } },
};
