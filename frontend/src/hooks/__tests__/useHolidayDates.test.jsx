import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import holidayService from '../../services/holidayService';
import useHolidayDates from '../useHolidayDates';

vi.mock('../../services/holidayService', () => ({ default: { getMonth: vi.fn().mockResolvedValue([]) } }));

it('retains recently used months and releases older calendar entries as new months are opened', async () => {
    const monthAt = offset => String(2026 + Math.floor(offset / 12)) + '-' + String(offset % 12 + 1).padStart(2, '0');
    const { rerender } = renderHook(month => useHolidayDates(month), { initialProps: monthAt(0) });
    for (let offset = 1; offset <= 64; offset += 1) {
        await act(async () => { rerender(monthAt(offset)); });
    }
    expect(holidayService.getMonth).toHaveBeenCalledTimes(65);

    await act(async () => { rerender(monthAt(1)); });
    expect(holidayService.getMonth).toHaveBeenCalledTimes(65);
    await act(async () => { rerender(monthAt(0)); });
    expect(holidayService.getMonth).toHaveBeenCalledTimes(66);
    expect(holidayService.getMonth).toHaveBeenLastCalledWith(monthAt(0));
});
