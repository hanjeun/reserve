export const messengerSelectionKey = selection => selection?.kind === 'admin' ? 'admin:' + selection.roomId
    : selection?.kind === 'owner' ? 'owner:' + selection.roomId
        : selection?.kind === 'store' ? 'store:' + selection.storeId : 'support';

export const messengerSearchResultKey = selection => selection?.messageId ? 'MESSAGE:' + selection.messageId
    : selection?.roomId ? 'CONVERSATION:' + selection.roomId : 'STORE:' + selection?.storeId;
