import { createContext } from 'react';

export const WorkspaceMenuContext = createContext(null);

export const isWorkspacePath = pathname => /^\/(admin|business|drafts)\/?$/.test(pathname);
