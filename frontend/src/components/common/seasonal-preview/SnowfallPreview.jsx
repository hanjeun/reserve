import Snowfall from 'react-snowfall';
import { useWindowWidth } from '../../../hooks/useWindowWidth';

export default function SnowfallPreview() {
    const mobile = useWindowWidth() < 576;
    return <Snowfall color="#98bce8" snowflakeCount={mobile ? 26 : 48}
        radius={[1.2, 3.6]} opacity={[0.42, 0.86]} speed={[0.48, 1.25]} wind={[-0.45, 0.85]} />;
}
