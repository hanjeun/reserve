import { useState, useEffect, useCallback } from 'react';
import storeService from '../services/storeService';

const useStoreData = (storeId) => {
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
            const data = await storeService.getStoreById(storeId);
            setStore(data);
        } catch (err) {
            setError(err?.message || '가게 정보를 불러오지 못했습니다.');
            setStore(null);
        } finally {
            setLoading(false);
        }
    }, [storeId]);

    useEffect(() => {
        fetchStore();
    }, [fetchStore]);

    return { store, loading, error, refetch: fetchStore };
};

export default useStoreData;
