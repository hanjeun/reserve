import PropTypes from 'prop-types';
import PageContainer from '../common/PageContainer';
import StoreDetailSkeleton from '../common/StoreDetailSkeleton';
import useStoreImageHint from '../../hooks/useStoreImageHint';
import { useWindowWidth } from '../../hooks/useWindowWidth';

/** The same lightweight frame is available before authentication, route code and store data. */
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
