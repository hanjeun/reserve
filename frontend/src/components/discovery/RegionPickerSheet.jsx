import LoadingStatus from '../common/LoadingStatus';
import LoadingImage from '../common/LoadingImage';
import { useId, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Skeleton } from 'antd';
import ResponsiveModal from '../common/ResponsiveModal';
import { EnvironmentOutlined } from '../common/icons';
import { useQuery } from '@tanstack/react-query';
import TextLink from '../common/TextLink';
import Button from '../common/Button';
import { ModalActionGroup } from '../common/ModalActions';
import DataState from '../common/DataState';
import { tourismService } from '../../services';
import { REGION_OPTIONS, formatRegionLabel } from '../../constants/regions';
import { tourismKeys } from '../../hooks/queryKeys';
import useReducedMotion from '../../hooks/useReducedMotion';

const EMPTY_GROUPS = [];
const selectionFor = value => ({ base: value, draft: value, activeGroup: value.split(' ')[0] });
// 세부 시군구가 없을 때 안내 문구.
const emptyAreaMessage = (groupCount, emptyProvince) => {
    if (groupCount > 0) return '세부 시군구가 없어요. 시도 전체를 적용할 수 있어요.';
    return emptyProvince;
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
                    <LoadingImage
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
const PopularAreaList = ({ isLoading, hasAreas, areas, draft, emptyPopular, onPick }) => {
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
    return <p className="reserve-region-sheet-popular-empty">{emptyPopular}</p>;
};

// 선택한 시도의 "전체" + 시군구 목록.
const GroupAreaList = ({ group, isLoading, draft, emptyProvince, unavailable, onSelect }) => (
    <>
        <button type="button" className={draft === group.name ? 'is-selected' : ''}
            aria-pressed={draft === group.name}
            onClick={() => onSelect(group.name)}>
            <span>{group.label} 전체</span>
            {!isLoading && !unavailable && <span className="reserve-region-sheet-count">{group.count}</span>}
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
        {unavailable && <p>시도 전체를 선택해 적용할 수 있어요.</p>}
        {!isLoading && !unavailable && group.areas.length === 0 &&
            <p>{emptyAreaMessage(group.count, emptyProvince)}</p>}
    </>
);

// 시도를 고르기 전(전국) 안내 + 인기 지역 바로가기.
const CountryOverview = ({ isLoading, areas, unavailable, copy, onPick }) => (
    <div className="reserve-region-sheet-country">
        <strong>{copy.countryTitle}</strong>
        <p>{unavailable ? '시도 전체를 선택해 적용할 수 있어요.' : copy.countryDescription}</p>
        {!isLoading && areas.slice(0, 4).map(area => (
            <button key={area.label} type="button" onClick={() => onPick(area)}>
                <span>{area.displayLabel}</span>
                <span className="reserve-region-sheet-count">{area.count}</span>
            </button>
        ))}
    </div>
);

/** 탐색·피드는 지역 데이터와 안내만 바꾸고 선택·취소·모달 동작을 공유한다. */
export default function RegionPickerSheet({ open, value = '', onClose, onApply, regionQuery, copy }) {
    const titleId = useId();
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
    const { data, isLoading, isError: regionError, error, refetch, isFetching } = regionQuery;
    const unavailable = regionError && !Array.isArray(data);
    const actualGroups = Array.isArray(data) ? data : EMPTY_GROUPS;
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
    // 지역 사진 조회 오류와 지역 선택 동작을 분리한다.
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
    // 사진이 없거나 프록시 조회가 실패하면 핀 아이콘을 유지한다.
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
            footer={<div className="reserve-region-sheet-actions">
                <ModalActionGroup>
                    <Button variant="outline" size="sm" onClick={() => { setDraft(''); setActiveGroup(''); }}>초기화</Button>
                    <Button variant="primary" size="sm" onClick={() => {
                        setSelection(selectionFor(draft));
                        onApply(draft);
                    }}>
                        {draft ? formatRegionLabel(draft) : copy.allLabel} 적용
                    </Button>
                </ModalActionGroup>
            </div>}
            width={520}
            zIndex={1100}
            transitionName={reducedMotion ? '' : 'reserve-region-sheet-motion'}
            maskTransitionName={reducedMotion ? '' : undefined}
            destroyOnHidden
            rootClassName="reserve-region-sheet-root"
            className="reserve-region-sheet"
            title={<span id={titleId} className="reserve-region-sheet-title"><EnvironmentOutlined aria-hidden="true" />{copy.title}</span>}
            aria-labelledby={titleId}
        >
            <p className="reserve-region-sheet-intro">{copy.intro}</p>
            <>
                    <section className="reserve-region-sheet-popular" aria-label={copy.popularTitle}>
                        <h3>{copy.popularTitle}</h3>
                        {regionError ? <DataState className="reserve-region-sheet-feedback" state="error" kind={copy.kind} error={error}
                            title={copy.errorTitle} description="시도 전체 선택은 계속 사용할 수 있어요."
                            onRetry={refetch} retrying={isFetching} compact />
                            : <PopularAreaList isLoading={isLoading} hasAreas={popularAreas.length > 0}
                                areas={popularAreasWithPhoto} draft={draft} emptyPopular={copy.emptyPopular} onPick={pickArea} />}
                        {!regionError && hasPhotoAttribution && (
                            <TextLink className="reserve-region-sheet-attribution-link" to="/content-sources#region-photos">
                                사진·콘텐츠 출처 및 이용조건
                            </TextLink>
                        )}
                    </section>
                    <div className="reserve-region-sheet-regions" aria-label="지역 목록">
                        <div className="reserve-region-sheet-groups" aria-label="시도">
                            <button type="button" className={!draft ? 'is-selected' : ''} aria-pressed={!draft}
                                onClick={() => { setActiveGroup(''); setDraft(''); }}>{copy.allLabel}</button>
                            {groups.map(group => (
                                <button key={group.name} type="button"
                                    className={shownGroup === group.name ? 'is-selected' : ''}
                                    aria-pressed={shownGroup === group.name}
                                    onClick={() => chooseGroup(group.name)}>
                                    <span>{group.label}</span>
                                    {!isLoading && !unavailable && <span className="reserve-region-sheet-count">{group.count}</span>}
                                </button>
                            ))}
                        </div>
                        <div className="reserve-region-sheet-areas" aria-label="시군구">
                            {selectedGroup ? (
                                <GroupAreaList group={selectedGroup} isLoading={isLoading} draft={draft}
                                    emptyProvince={copy.emptyProvince} unavailable={unavailable} onSelect={setDraft} />
                            ) : (
                                <CountryOverview isLoading={isLoading} areas={popularAreasWithPhoto} unavailable={unavailable} copy={copy} onPick={pickArea} />
                            )}
                        </div>
                    </div>
            </>
        </ResponsiveModal>
    );
}

RegionPickerSheet.propTypes = {
    open: PropTypes.bool.isRequired,
    value: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onApply: PropTypes.func.isRequired,
    regionQuery: PropTypes.shape({
        data: PropTypes.array, isLoading: PropTypes.bool, isError: PropTypes.bool,
        error: PropTypes.any, refetch: PropTypes.func, isFetching: PropTypes.bool,
    }).isRequired,
    copy: PropTypes.shape({
        title: PropTypes.string.isRequired, intro: PropTypes.string.isRequired,
        popularTitle: PropTypes.string.isRequired, allLabel: PropTypes.string.isRequired,
        countryTitle: PropTypes.string.isRequired, countryDescription: PropTypes.string.isRequired,
        emptyPopular: PropTypes.string.isRequired, emptyProvince: PropTypes.string.isRequired,
        errorTitle: PropTypes.string.isRequired, kind: PropTypes.string.isRequired,
    }).isRequired,
};
