const DARK_FOREGROUND = '#16181c';
const LIGHT_FOREGROUND = '#ffffff';

const luminance = hex => {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = (first, second) => (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);

/** Pick readable text for opaque literal palette colors, before creating CSS variables. */
export const foregroundForSurface = background => {
    const surface = luminance(background);
    return contrast(surface, luminance(DARK_FOREGROUND)) >= contrast(surface, 1)
        ? DARK_FOREGROUND : LIGHT_FOREGROUND;
};

/** Keep white action text readable without changing the brand/link color. */
export const surfaceForWhiteText = background => {
    if (contrast(luminance(background), 1) >= 4.5) return background;
    const channels = [1, 3, 5].map(offset => parseInt(background.slice(offset, offset + 2), 16));
    const shade = factor => '#' + channels.map(channel => Math.floor(channel * factor).toString(16).padStart(2, '0')).join('');
    let low = 0, high = 1;
    for (let index = 0; index < 24; index++) {
        const middle = (low + high) / 2;
        if (contrast(luminance(shade(middle)), 1) >= 4.5) low = middle;
        else high = middle;
    }
    return shade(low);
};
