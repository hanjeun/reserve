import { describe, expect, it } from 'vitest';
import { filterAndSortOwnedStores } from './ownedStoreFilters';

const stores = [
    { id: 1, name: '안산 한식', address: '경기도 안산시 단원구', serviceDomain: 'FOOD', rating: 4.2, reviewCount: 8 },
    { id: 2, name: '서울 뷰티', address: '서울특별시 종로구 청와대로', serviceDomain: 'BEAUTY_CLINIC', rating: 4.9, reviewCount: 1 },
    { id: 3, name: '안산 카페', address: '경기 안산시 상록구', serviceDomain: 'FOOD', rating: 0, reviewCount: 0 },
];

describe('owned store toolbar data', () => {
    it('preserves server recent order by default and filters/sorts locally without mutating input', () => {
        expect(filterAndSortOwnedStores(stores, { domain: 'FOOD' }).map(store => store.id)).toEqual([1, 3]);
        expect(filterAndSortOwnedStores(stores, { sort: 'rating' }).map(store => store.id)).toEqual([2, 1, 3]);
        expect(filterAndSortOwnedStores(stores, { sort: 'reviewCount' }).map(store => store.id)).toEqual([1, 2, 3]);
        expect(stores.map(store => store.id)).toEqual([1, 2, 3]);
    });
});
