import { createContext, useContext } from 'react';

export const LiveUpdatesContext = createContext({ present: false, connected: false, domains: [] });
export default function useLiveUpdatesStatus() { return useContext(LiveUpdatesContext); }
