/** Only positive intrinsic dimensions can reserve an image's layout. */
export const imageDimensions = value => Number.isSafeInteger(value?.width) && value.width > 0
    && Number.isSafeInteger(value?.height) && value.height > 0
    ? { width: value.width, height: value.height } : null;
