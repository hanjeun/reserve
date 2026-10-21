import { StarFilled, HeartOutlined, HeartFilled } from '../../../../../frontend/src/components/common/icons.js';
import StoreIdentityText from '../../../../../frontend/src/components/store/StoreIdentityText.jsx';
import { colors, fontSize, fontWeight } from '../../../../../frontend/src/styles/tokens/index.js';

export default function MarketingStoreCard({ store }) {
    return <div className="reserve-card ant-card-hoverable marketing-store-card" style={{
        borderRadius: 0, overflow: 'hidden', border: `1px solid ${colors.border.light}`,
        background: colors.background.paper,
    }}>
        <div className="reserve-store-card-shell">
            <div style={{ overflow: 'hidden', lineHeight: 0, margin: 0 }}>
                <img src={store.img} alt={store.name} className="reserve-card-image" style={{
                    width: '100%', height: 'auto', objectFit: 'cover', transition: 'transform 0.3s', display: 'block',
                }} />
            </div>
            <div className="reserve-store-card-info">
                <div className="reserve-store-card-title-line">
                    <h5 className="reserve-store-card-name" style={{
                        margin: 0, fontSize: fontSize.xl, fontWeight: fontWeight.semibold,
                        lineHeight: 1.4, color: colors.text.primary,
                    }}>{store.name}</h5>
                    <div className="reserve-store-card-favorite">
                        <button type="button" data-demo-like aria-label={`${store.name} 즐겨찾기`} aria-pressed="false"
                            className="reserve-favorite-button reserve-favorite-button--plain" style={{
                                border: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'transparent', color: colors.text.secondary, flexShrink: 0,
                            }}>
                            <span className="marketing-heart-filled"><HeartFilled style={{ color: colors.error.main }} /></span>
                            <span className="marketing-heart-outline"><HeartOutlined /></span>
                        </button>
                    </div>
                </div>
                <StoreIdentityText category={store.category} />
                <div className="reserve-store-card-rating" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <StarFilled style={{ color: colors.warning.main, fontSize: 14 }} />
                    <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text.primary }}>{store.rating.toFixed(1)}</span>
                    <span style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>({store.reviewCount.toLocaleString('ko-KR')})</span>
                </div>
            </div>
        </div>
    </div>;
}
