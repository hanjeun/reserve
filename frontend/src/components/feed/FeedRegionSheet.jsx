import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import RegionPickerSheet from '../discovery/RegionPickerSheet';
import { feedKeys } from '../../hooks/feedQueries';
import feedService from '../../services/feedService';

const copy = {
    title: '피드 지역', intro: '지역별 글과 사진을 모아보세요. 지역이 없는 글은 전체 피드에서 볼 수 있어요.',
    popularTitle: '게시물이 많은 지역', allLabel: '전체 피드', countryTitle: '전체 지역 게시물',
    countryDescription: '시도를 선택하면 게시물이 있는 세부 지역을 볼 수 있어요.',
    emptyPopular: '아직 모아볼 세부 지역이 없어요. 아래에서 시도를 선택해보세요.',
    emptyProvince: '이 지역에 게시된 글이 없어요. 다른 지역이나 전체 피드를 선택해보세요.',
    errorTitle: '피드 지역을 불러오지 못했어요.', kind: 'news',
};

export default function FeedRegionSheet({ open, ...props }) {
    const query = useQuery({
        queryKey: feedKeys.regions(), queryFn: ({ signal }) => feedService.regions(signal), enabled: open, staleTime: 180_000,
    });
    return <RegionPickerSheet {...props} open={open} copy={copy} regionQuery={query} />;
}
FeedRegionSheet.propTypes = { open: PropTypes.bool.isRequired, value: PropTypes.string,
    onClose: PropTypes.func.isRequired, onApply: PropTypes.func.isRequired };
