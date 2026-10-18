import { createContext, useContext, useLayoutEffect } from 'react';

export const EditorDialogContext = createContext(null);
export function useEditorDialog({ title, footer, onClose, scrollResetKey, width }) {
    const context = useContext(EditorDialogContext);
    useLayoutEffect(() => {
        if (!context) throw new Error('Editor form requires an EditorDialog.');
        return context.register({ title, footer, onClose, scrollResetKey, width });
    }, [context, title, footer, onClose, scrollResetKey, width]);
}
