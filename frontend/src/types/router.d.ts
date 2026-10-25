import type { NavigateOptions, To } from 'react-router';

// BrowserRouter의 동기 이동 계약을 사용한다.
// Promise를 반환하는 RouterProvider와 타입 계약을 구분한다.
// https://reactrouter.com/api/hooks/useNavigate#return-type-augmentation
declare module 'react-router' {
    interface NavigateFunction {
        (to: To, options?: NavigateOptions): void;
        (delta: number): void;
    }
}
