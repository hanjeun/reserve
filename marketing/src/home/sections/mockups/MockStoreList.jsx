import { STORE_DATA } from '../../Home.data';
import MarketingStoreCard from './MarketingStoreCard';

export default function MockStoreList() {
    return <div style={{ width: '100%', maxWidth: 380, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, boxSizing: 'border-box' }}>
        {STORE_DATA.map(store => <MarketingStoreCard key={store.name} store={store} />)}
    </div>;
}
