import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** 계정 세대마다 새 클라이언트와 하위 UI를 만든다. 이전 mutation은 옛 클라이언트만 참조한다. */
const SessionQueryProvider = ({ children }) => {
    const [client] = useState(() => new QueryClient({
        defaultOptions: {
            queries: { staleTime: 1000 * 60 * 3, gcTime: 1000 * 60 * 10, retry: 1, refetchOnWindowFocus: false },
        },
    }));
    useEffect(() => () => { client.clear(); }, [client]);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

export default SessionQueryProvider;
