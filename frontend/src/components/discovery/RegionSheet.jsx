import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { storeService } from '../../services';
import { storeKeys } from '../../hooks/queryKeys';
import RegionPickerSheet from './RegionPickerSheet';

const copy = {
    title: '지역 선택', intro: '시도를 고르고, 가게가 있는 시군구를 좁혀 보세요.',
    popularTitle: '가게가 많은 지역', allLabel: '전국', countryTitle: '전국에서 찾아보기',
    countryDescription: '시도를 선택하면 세부 지역을 볼 수 있어요.',
    emptyPopular: '아직 많이 찾는 지역이 없어요.',
    emptyProvince: '현재 등록된 가게가 없어요. 이 지역으로 검색하면 빈 결과가 표시돼요.',
    errorTitle: '지역 정보를 불러오지 못했어요.', kind: 'store',
};
const ownerCopy = {
    ...copy, intro: '내 가게가 있는 시도와 시군구를 고르세요.', popularTitle: '내 가게가 있는 지역',
    emptyPopular: '아직 등록한 가게가 없어요.', emptyProvince: '이 시도에 등록한 내 가게가 없어요.',
};

export default function RegionSheet({ open, availableGroups, ...props }) {
    const ownerRegions = Array.isArray(availableGroups);
    const query = useQuery({
        queryKey: storeKeys.regions(), queryFn: storeService.getRegions, enabled: open && !ownerRegions, staleTime: 180_000,
    });
    return <RegionPickerSheet {...props} open={open} copy={ownerRegions ? ownerCopy : copy}
        regionQuery={ownerRegions ? { data: availableGroups, isLoading: false, isError: false, isFetching: false } : query} />;
}
RegionSheet.propTypes = {
    open: PropTypes.bool.isRequired,
    value: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onApply: PropTypes.func.isRequired,
    availableGroups: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired, count: PropTypes.number.isRequired,
        areas: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string.isRequired, count: PropTypes.number.isRequired })),
    })),
};