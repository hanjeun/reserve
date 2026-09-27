/** URL은 기존 주소의 약칭과 맞추고, UI에는 공식 시도 명칭을 보여준다. */
export const REGION_OPTIONS = [
    { value: '서울', label: '서울특별시' },
    { value: '부산', label: '부산광역시' },
    { value: '대구', label: '대구광역시' },
    { value: '인천', label: '인천광역시' },
    { value: '광주', label: '광주광역시' },
    { value: '대전', label: '대전광역시' },
    { value: '울산', label: '울산광역시' },
    { value: '세종', label: '세종특별자치시' },
    { value: '경기', label: '경기도' },
    { value: '강원', label: '강원특별자치도' },
    { value: '충북', label: '충청북도' },
    { value: '충남', label: '충청남도' },
    { value: '전북', label: '전북특별자치도' },
    { value: '전남', label: '전라남도' },
    { value: '경북', label: '경상북도' },
    { value: '경남', label: '경상남도' },
    { value: '제주', label: '제주특별자치도' },
];

export const formatRegionLabel = value => {
    if (!value) return '전국';
    const [region, ...area] = value.split(' ');
    const label = REGION_OPTIONS.find(option => option.value === region)?.label || region;
    return [label, ...area].join(' ');
};
