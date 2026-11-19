import PropTypes from 'prop-types';
import PageContainer from '../common/PageContainer';
import Bone from '../common/Bone';
import StoreDetailSkeleton from '../common/StoreDetailSkeleton';
import useStoreImageHint from '../../hooks/useStoreImageHint';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { STORE_DETAIL_PATH } from '../../utils/storePublicAddress';

/* 인증·라우트·가게 데이터 로딩에서 같은 경량 프레임을 사용한다. */
export default function StoreDetailLoading({ storeId, pathname, isPC: suppliedIsPC }) {
    const id = storeId ?? STORE_DETAIL_PATH.exec(pathname || '')?.[1];
    const imageHint = useStoreImageHint(id);
    const width = useWindowWidth();
    const isPC = suppliedIsPC ?? width >= 900;
    return <PageContainer size={isPC ? 'xl' : 'md'} paddingTop={isPC ? '32px' : '20px'}
        className={isPC ? 'reserve-data-skeleton' : 'reserve-data-skeleton reserve-store-detail reserve-store-detail--sectioned'} aria-busy="true">
        {!isPC && <div className="reserve-discovery-top-nav reserve-store-section-nav reserve-store-section-nav-skeleton" aria-hidden="true">
            <div className="reserve-discovery-top-nav-inner">
                {['소개', '위치', '예약', '리뷰'].map(label => <div key={label}><Bone width={26} height={12} /></div>)}
            </div>
        </div>}
        <StoreDetailSkeleton imageHint={imageHint} isPC={isPC} />
    </PageContainer>;
}
StoreDetailLoading.propTypes = { storeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), pathname: PropTypes.string, isPC: PropTypes.bool };
