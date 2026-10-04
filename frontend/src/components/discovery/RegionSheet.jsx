import LoadingStatus from '../common/LoadingStatus';
import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Skeleton } from 'antd';
import ResponsiveModal from '../common/ResponsiveModal';
import { EnvironmentOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, DataState } from '../common';
import { storeService, tourismService } from '../../services';
import { REGION_OPTIONS, formatRegionLabel } from '../../constants/regions';
import { storeKeys, tourismKeys } from '../../hooks/queryKeys';
import useReducedMotion from '../../hooks/useReducedMotion';

const EMPTY_GROUPS = [];
const selectionFor = value => ({ base: value, draft: value, activeGroup: value.split(' ')[0] });
// 세부 시군구가 없을 때 안내 문구.
const emptyAreaMessage = (groupCount, ownerRegions) => {
    if (groupCount > 0) return '세부 시군구가 없습니다. 시도 전체를 적용할 수 있어요.';
    if (ownerRegions) return '이 시도에 등록한 내 가게가 없습니다.';
    return '현재 등록된 가게가 없습니다. 이 지역으로 검색하면 빈 결과가 표시됩니다.';
};

const buildRegionGroups = actualGroups => REGION_OPTIONS.map(option => {
    const actual = actualGroups.find(group => group.name === option.value);
    return { name: option.value, label: option.label, count: actual?.count || 0, areas: actual?.areas || [] };
});

const buildPopularAreas = actualGroups => actualGroups
    .filter(group => REGION_OPTIONS.some(option => option.value === group.name))
    .flatMap(group => (group.areas || []).map(area => ({
        label: `${group.name} ${area.name}`,
        displayLabel: formatRegionLabel(`${group.name} ${area.name}`),
        count: area.count,
        group: group.name,
    })))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko-KR'))
    .slice(0, 6);

const PopularAreaButton = ({ area, draft, onPick }) => {
    const photoSrc = area.photo?.src ?? area.photo?.imageUrl;
    return (
        <button
            type="button"
            className={'reserve-region-sheet-popular-item' + (draft === area.label ? ' is-selected' : '')}
            aria-pressed={draft === area.label}
            onClick={() => onPick(area)}
        >
            <span className="reserve-region-sheet-popular-icon" aria-hidden="true">
                <EnvironmentOutlined />
                {photoSrc && (
                    <img
                        src={photoSrc}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(event) => { event.currentTarget.hidden = true; }}
                    />
                )}
            </span>
            <span>{area.displayLabel}</span>
        </button>
    );
};

// 인기 지역 영역 — 로딩 스켈레톤 / 목록 / 빈 안내 중 하나.
const PopularAreaList = ({ isLoading, hasAreas, areas, draft, ownerRegions, onPick }) => {
    if (isLoading) {
        return (
            <LoadingStatus className="reserve-region-sheet-popular-list" aria-label="인기 지역을 불러오는 중" aria-busy="true">
                {[0, 1, 2, 3, 4, 5].map(index => (
                    <div key={index} className="reserve-region-sheet-popular-placeholder" aria-hidden="true">
                        <Skeleton.Avatar active shape="circle" size={52} />
                        <Skeleton.Input active size="small" />
                    </div>
                ))}
            </LoadingStatus>
        );
    }
    if (hasAreas) {
        return (
            <div className="reserve-region-sheet-popular-list">
                {areas.map(area => (
                    <PopularAreaButton key={area.label} area={area} draft={draft} onPick={onPick} />
                ))}
            </div>
        );
    }
    return <p className="reserve-region-sheet-popular-empty">{ownerRegions ? '아직 등록한 가게가 없습니다.' : '아직 많이 찾는 지역이 없습니다.'}</p>;
};

// 선택한 시도의 "전체" + 시군구 목록.
const GroupAreaList = ({ group, isLoading, draft, ownerRegions, onSelect }) => (
    <>
        <button type="button" className={draft === group.name ? 'is-selected' : ''}
            aria-pressed={draft === group.name}
            onClick={() => onSelect(group.name)}>
            <span>{group.label} 전체</span>
            {!isLoading && <span className="reserve-region-sheet-count">{group.count}</span>}
        </button>
        {isLoading ? <LoadingStatus className="reserve-region-sheet-loading" aria-label="세부 지역을 불러오는 중" aria-busy="true"><Skeleton active title={false} paragraph={{ rows: 4 }} /></LoadingStatus>
            : group.areas.map(area => {
            const areaValue = `${group.name} ${area.name}`;
            return <button key={area.name} type="button" className={draft === areaValue ? 'is-selected' : ''}
                aria-pressed={draft === areaValue}
                onClick={() => onSelect(areaValue)}>
                <span>{area.name}</span>
                <span className="reserve-region-sheet-count">{area.count}</span>
            </button>;
        })}
        {!isLoading && group.areas.length === 0 &&
            <p>{emptyAreaMessage(group.count, ownerRegions)}</p>}
    </>
);

// 시도를 고르기 전(전국) 안내 + 인기 지역 바로가기.
const CountryOverview = ({ isLoading, areas, onPick }) => (
    <div className="reserve-region-sheet-country">
        <strong>전국에서 찾아보기</strong>
        <p>시도를 선택하면 세부 지역을 볼 수 있어요.</p>
        {!isLoading && areas.slice(0, 4).map(area => (
            <button key={area.label} type="button" onClick={() => onPick(area)}>
                <span>{area.displayLabel}</span>
                <span className="reserve-region-sheet-count">{area.count}</span>
            </button>
        ))}
    </div>
);

/** 홈과 목록이 같은 선택 데이터·적용 행동을 쓰는 지역 시트. */
export default function RegionSheet({ open, value = '', onClose, onApply, availableGroups }) {
    const reducedMotion = useReducedMotion();
    const [selection, setSelection] = useState(() => selectionFor(value));
    const currentSelection = selection.base === value ? selection : selectionFor(value);
    const { draft, activeGroup } = currentSelection;
    const updateSelection = patch => setSelection(previous => ({
        ...(previous.base === value ? previous : selectionFor(value)),
        ...patch,
    }));
    const setDraft = nextDraft => updateSelection({ draft: nextDraft });
    const setActiveGroup = nextGroup => updateSelection({ activeGroup: nextGroup });
    const handleClose = () => {
        setSelection(selectionFor(value));
        onClose();
    };
    const { data, isLoading: queryLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: storeKeys.regions(),
        queryFn: storeService.getRegions,
        enabled: open && !availableGroups,
        staleTime: 1000 * 60 * 3,
    });
    const isLoading = !availableGroups && queryLoading;
    const ownerRegions = Array.isArray(availableGroups);
    // 사장님 화면이 넘겨준 지역이 있으면 그것을, 없으면 조회 결과를 쓴다.
    const fetchedGroups = Array.isArray(data) ? data : EMPTY_GROUPS;
    const actualGroups = Array.isArray(availableGroups) ? availableGroups : fetchedGroups;
    const groups = buildRegionGroups(actualGroups);
    const shownGroup = activeGroup || draft.split(' ')[0];
    const selectedGroup = groups.find(group => group.name === shownGroup);
    const popularAreas = useMemo(() => buildPopularAreas(actualGroups), [actualGroups]);
    const photoRegions = useMemo(
        // 17개 시도 코드를 일괄 등록하지 않는다. 현재 보이는 인기 지역만 조회하고, 새 지역이
        // 목록에 나타나면 서버가 같은 방식으로 후보를 검증·캐시한다.
        () => [...new Set(popularAreas.map(area => area.group))],
        [popularAreas],
    );
    // 사진 조회가 실패하거나 키가 아직 반영되지 않아도 지역 선택은 그대로 작동한다.
    const { data: dynamicPhotos = [] } = useQuery({
        queryKey: tourismKeys.regionPhotos(photoRegions),
        queryFn: () => tourismService.getRegionPhotos(photoRegions),
        enabled: open && photoRegions.length > 0,
        staleTime: 1000 * 60 * 60 * 24,
        retry: false,
    });
    const dynamicPhotoByRegion = useMemo(
        () => new Map((Array.isArray(dynamicPhotos) ? dynamicPhotos : []).map(photo => [photo.region, photo])),
        [dynamicPhotos],
    );
    // 지역 사진은 서버가 공공누리 제1유형을 확인한 관광정보 API 카탈로그만 쓴다.
    // 사진이 없거나 이미지 프록시가 실패하면 기존 핀 아이콘이 그대로 남는다.
    const popularAreasWithPhoto = useMemo(
        () => popularAreas.map(area => ({ ...area, photo: dynamicPhotoByRegion.get(area.group) ?? null })),
        [dynamicPhotoByRegion, popularAreas],
    );
    const hasPhotoAttribution = popularAreasWithPhoto.some(({ photo }) => Boolean(photo));

    const chooseGroup = name => {
        setActiveGroup(name);
        setDraft(name);
    };

    const pickArea = area => {
        setActiveGroup(area.group);
        setDraft(area.label);
    };

    return (
        <ResponsiveModal
            mobileSheet={false}
            centered={false}
            open={open}
            onCancel={handleClose}
            footer={null}
            width={600}
            zIndex={1100}
            transitionName={reducedMotion ? '' : 'reserve-region-sheet-motion'}
            maskTransitionName={reducedMotion ? '' : undefined}
            destroyOnHidden
            rootClassName="reserve-region-sheet-root"
            className="reserve-region-sheet"
            title={<span id="reserve-region-sheet-title">지역 선택</span>}
            aria-labelledby="reserve-region-sheet-title"
        >
            <p className="reserve-region-sheet-intro">{ownerRegions ? '내 가게가 있는 시도와 시군구를 고르세요.' : '시도를 고르고, 가게가 있는 시군구를 좁혀 보세요.'}</p>
            {!availableGroups && isError && (
                <DataState className="reserve-region-sheet-feedback" state="error" kind="store" error={error}
                    title="세부 지역을 불러오지 못했어요. 시도 선택은 계속 사용할 수 있습니다."
                    onRetry={refetch} retrying={isFetching} compact />
            )}
            <>
                    <section className="reserve-region-sheet-popular" aria-label={ownerRegions ? '내 가게가 있는 지역' : '가게가 많은 지역'}>
                        <h3>{ownerRegions ? '내 가게가 있는 지역' : '가게가 많은 지역'}</h3>
                        <PopularAreaList isLoading={isLoading} hasAreas={popularAreas.length > 0}
                            areas={popularAreasWithPhoto} draft={draft} ownerRegions={ownerRegions} onPick={pickArea} />
                        {hasPhotoAttribution && (
                            <Link className="reserve-region-sheet-attribution-link" to="/content-sources#region-photos">
                                사진·콘텐츠 출처 및 이용조건
                            </Link>
                        )}
                    </section>
                    <div className="reserve-region-sheet-regions" aria-label="지역 목록">
                        <div className="reserve-region-sheet-groups" aria-label="시도">
                            <button type="button" className={!draft ? 'is-selected' : ''} aria-pressed={!draft}
                                onClick={() => { setActiveGroup(''); setDraft(''); }}>전국</button>
                            {groups.map(group => (
                                <button key={group.name} type="button"
                                    className={shownGroup === group.name ? 'is-selected' : ''}
                                    aria-pressed={shownGroup === group.name}
                                    onClick={() => chooseGroup(group.name)}>
                                    <span>{group.label}</span>
                                    {!isLoading && <span className="reserve-region-sheet-count">{group.count}</span>}
                                </button>
                            ))}
                        </div>
                        <div className="reserve-region-sheet-areas" aria-label="시군구">
                            {selectedGroup ? (
                                <GroupAreaList group={selectedGroup} isLoading={isLoading} draft={draft}
                                    ownerRegions={ownerRegions} onSelect={setDraft} />
                            ) : (
                                <CountryOverview isLoading={isLoading} areas={popularAreasWithPhoto} onPick={pickArea} />
                            )}
                        </div>
                    </div>
            </>
            <div className="reserve-region-sheet-actions">
                <Button variant="outline" onClick={() => { setDraft(''); setActiveGroup(''); }}>초기화</Button>
                <Button variant="primary" onClick={() => {
                    setSelection(selectionFor(draft));
                    onApply(draft);
                }}>
                    {formatRegionLabel(draft)} 적용
                </Button>
            </div>
        </ResponsiveModal>
    );
}

RegionSheet.propTypes = {
    open: PropTypes.bool.isRequired,
    value: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onApply: PropTypes.func.isRequired,
    availableGroups: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        count: PropTypes.number.isRequired,
        areas: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string.isRequired, count: PropTypes.number.isRequired })),
    })),
};
