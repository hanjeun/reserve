import { useSyncExternalStore } from 'react';
import { getInputModality, subscribeInputModality } from './inputModality';

export default function useInputModality() {
    return useSyncExternalStore(subscribeInputModality, getInputModality, () => 'pointer');
}
