import { App } from 'antd';

/** AntD App.useApp() 래퍼 — message, modal, notification 제공 */
const useMessage = () => {
    const { message, modal, notification } = App.useApp();
    return {
        message,
        modal,
        notification,
        confirm: (options) => modal.confirm({ title: '확인', okText: '확인', cancelText: '취소', ...options }),
    };
};

export default useMessage;
