import { createRoot } from 'react-dom/client';
import SeasonalPreview from '../../frontend/src/components/common/seasonal-preview/SeasonalPreview';

const host = document.createElement('div');
host.className = 'reserve-season-preview-host';
const mobile = window.matchMedia('(max-width: 768px)');
const mount = () => {
    const layout = mobile.matches ? '.marketing-mobile' : '.marketing-desktop';
    document.querySelector(`${layout} .marketing-home > [data-marketing-backdrop]`)?.after(host);
};
mount();
mobile.addEventListener('change', mount);
createRoot(host).render(<SeasonalPreview />);
