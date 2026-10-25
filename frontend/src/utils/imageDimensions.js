/* 유효한 양수의 원본 크기만 이미지 배치 예약에 사용한다. */
export const imageDimensions = value => Number.isSafeInteger(value?.width) && value.width > 0
    && Number.isSafeInteger(value?.height) && value.height > 0
    ? { width: value.width, height: value.height } : null;
