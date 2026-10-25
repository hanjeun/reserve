import { createContext } from 'react';

/* 같은 도구가 유지돼도 표시 경로가 바뀌면 안내를 닫는다. */
export const TooltipScopeContext = createContext(null);
