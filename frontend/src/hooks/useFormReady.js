import { useState, useCallback, useRef } from 'react';

// AntD Form 마운트 전 setFieldsValue 호출 시 발생하는 "not connected" 경고 방지
const useFormReady = () => {
    const [formReady, setFormReady] = useState(false);
    const hasSetRef = useRef(false);

    const formRef = useCallback((node) => {
        if (node && !hasSetRef.current) {
            hasSetRef.current = true;
            setFormReady(true);
        }
    }, []);

    const resetFormReady = useCallback(() => {
        hasSetRef.current = false;
        setFormReady(false);
    }, []);

    return { formReady, formRef, resetFormReady };
};

export default useFormReady;
