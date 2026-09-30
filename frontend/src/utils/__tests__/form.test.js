import { describe, expect, it } from 'vitest';
import { buildStoreFormData } from '../form';

describe('store image autoplay form contract', () => {
    it.each([true, false])('sends an explicit %s setting', imageAutoplayEnabled => {
        expect(buildStoreFormData({ name: '가게', imageAutoplayEnabled }).get('imageAutoplayEnabled'))
            .toBe(String(imageAutoplayEnabled));
    });

    it('does not overwrite an existing setting when an older form omits the field', () => {
        expect(buildStoreFormData({ name: '가게' }).has('imageAutoplayEnabled')).toBe(false);
    });
});
