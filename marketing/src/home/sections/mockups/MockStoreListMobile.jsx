import { STORE_DATA } from '../../Home.data';
import MarketingStoreCard from './MarketingStoreCard';

export default function MockStoreListMobile() {
    return <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, boxSizing: 'border-box' }}>
        {STORE_DATA.map(store => <MarketingStoreCard key={store.name} store={store} />)}
    </div>;
}
