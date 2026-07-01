import { useState, useEffect, useCallback } from 'react';
import storeService from '../services/storeService';

/**
 * 가게 데이터 로딩 훅
 * @param {string|number} storeId 
 * @param {object} options
 * @param {boolean} options.forEdit true면 인증된 /edit 엔드포인트 사용 (소유자만 접근 가능)
 */
const useStoreData = (storeId, { forEdit = false } = {}) => {
    const [store, setStore] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchStore = useCallback(async () => {
        if (!storeId) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            setError(null);
            // forEdit=true: 인증된 엔드포인트 사용 → URL 조작해도 다른 가게 데이터 노출 안됨
            const data = forEdit
                ? await storeService.getStoreForEdit(storeId)
                : await storeService.getStoreById(storeId);
            setStore(data);
        } catch (err) {
            setError(err?.message || '가게 정보를 불러오지 못했습니다.');
            setStore(null);
        } finally {
            setLoading(false);
        }
    }, [storeId, forEdit]);

    useEffect(() => {
        fetchStore();
    }, [fetchStore]);

    return { store, loading, error, refetch: fetchStore };
};

export default useStoreData;
