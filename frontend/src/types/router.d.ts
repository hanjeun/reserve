import type { NavigateOptions, To } from 'react-router';

// App.jsx uses BrowserRouter; its navigation is synchronous.
// RouterProvider returns a Promise and needs a different contract.
// https://reactrouter.com/api/hooks/useNavigate#return-type-augmentation
declare module 'react-router' {
    interface NavigateFunction {
        (to: To, options?: NavigateOptions): void;
        (delta: number): void;
    }
}
