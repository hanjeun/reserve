export const LINES = [
    { before: '버튼 ', blue: '클릭 한 번', after: '으로' },
    { before: '더 쉽고 ', blue: '더 놀라운', after: ' 경험을' },
    { before: '', blue: '원하는 곳', after: '을 예약하세요' },
    { before: '', blue: '지금 바로', after: ' 시작해보세요' },
];

export function fullText(line) {
    return line.before + line.blue + line.after;
}
