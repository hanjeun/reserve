import { SpinIndicator } from './Loading';

const controlLoadingIcon = <span aria-hidden="true" style={{ display: 'inline-flex' }}><SpinIndicator /></span>;
export const loadingConfig = {
    spin: { indicator: <SpinIndicator /> },
    button: { loadingIcon: controlLoadingIcon },
    select: { loadingIcon: controlLoadingIcon },
};
