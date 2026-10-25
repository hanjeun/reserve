import PropTypes from 'prop-types';
import PageContainer from '../common/PageContainer';
import StoreDetailSkeleton from '../common/StoreDetailSkeleton';
import useStoreImageHint from '../../hooks/useStoreImageHint';
import { useWindowWidth } from '../../hooks/useWindowWidth';

/* 인증·라우트·가게 데이터 로딩에서 같은 경량 프레임을 사용한다. */
export default function StoreDetailLoading({ storeId, pathname, isPC: suppliedIsPC }) {
    const id = storeId ?? /^\/store\/([0-9]+)\/?$/.exec(pathname || '')?.[1];
    const imageHint = useStoreImageHint(id);
    const width = useWindowWidth();
    const isPC = suppliedIsPC ?? width >= 900;
    return <PageContainer size={isPC ? 'xl' : 'md'} paddingTop={isPC ? '32px' : '20px'}
        className="reserve-data-skeleton" aria-busy="true">
        <StoreDetailSkeleton imageHint={imageHint} isPC={isPC} />
    </PageContainer>;
}
StoreDetailLoading.propTypes = { storeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), pathname: PropTypes.string, isPC: PropTypes.bool };
