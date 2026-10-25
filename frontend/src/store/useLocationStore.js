import { create } from 'zustand';

/*
 * 마지막으로 얻은 현재 위치는 메모리에만 보관한다. 정렬 URL과 분리해 정렬 변경 뒤에도 동네 표시에 사용할 수 있게 한다.
 */
const useLocationStore = create((set) => ({
    liveLocation: null, // { latitude, longitude } | null
    setLiveLocation: (loc) => set({ liveLocation: loc }),
}));

export default useLocationStore;
