import { useCallback, useEffect, useState } from 'react';
import { readDiscoveryRegion, saveDiscoveryRegion, validDiscoveryRegion } from '../utils/discoveryRegion';

export default function useDiscoveryRegion(searchParams) {
    const explicitRegion = validDiscoveryRegion(searchParams.get('region'));
    const [remembered, setRemembered] = useState(() => ({
        explicit: explicitRegion,
        saved: explicitRegion ?? readDiscoveryRegion(),
    }));
    if (remembered.explicit !== explicitRegion) {
        setRemembered({ explicit: explicitRegion, saved: explicitRegion ?? remembered.saved });
    }
    const region = explicitRegion ?? remembered.saved;

    useEffect(() => {
        if (explicitRegion == null) return;
        saveDiscoveryRegion(explicitRegion);
    }, [explicitRegion]);

    const rememberRegion = useCallback(value => {
        if (!saveDiscoveryRegion(value)) return false;
        setRemembered(current => ({ ...current, saved: value }));
        return true;
    }, []);

    // URL은 각 화면의 기존 setter만 갱신한다. view·페이지 정규화와 경쟁하지 않는다.
    return [region, rememberRegion];
}
