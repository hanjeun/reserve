import { describe, expect, it } from 'vitest';
import { serializeCsv } from '../csv';

describe('statistics CSV cells', () => {
    it('preserves Korean, quotes, commas, line breaks and numeric amounts without display formatting', () => {
        const columns = [{ key: 'name', label: '가게' }, { key: 'amount', label: '순결제액' }];
        const rows = [{ name: '한글, "가게"\r\n둘째 줄', amount: -1250.75 }];
        expect(serializeCsv(columns, rows)).toBe('\uFEFF"가게","순결제액"\r\n"한글, ""가게""\r\n둘째 줄",-1250.75\r\n');
    });

    it.each([
        '=1+1', '+SUM(1,2)', '-1+2', '@SUM(1,2)', ' \t=1+1', '\r\n+1', '\u0000=1',
    ])('neutralizes formula text %j after whitespace or control characters', value => {
            expect(serializeCsv([{ key: 'text', label: '값' }], [{ text: value }]))
                .toBe(`\uFEFF"값"\r\n"'${value}"\r\n`);
        });

    it('keeps numeric text as text, treats negative text safely and leaves missing/non-finite amounts empty', () => {
        const columns = [{ key: 'id', label: '식별자' }, { key: 'text', label: '문구' }, { key: 'amount', label: '금액' }];
        expect(serializeCsv(columns, [{ id: '00123', text: '-20', amount: Infinity }, { id: null, text: undefined, amount: NaN }]))
            .toBe('\uFEFF"식별자","문구","금액"\r\n"00123","\'-20",\r\n,,\r\n');
    });
});
