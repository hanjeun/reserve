# 🎨 React 프론트엔드 개발 명세서

> 작성일: 2026-01-31  
> 백엔드: Spring Boot REST API  
> 프론트엔드: React + TypeScript (권장)

---

## 📋 목차
1. [프로젝트 구조](#프로젝트-구조)
2. [환경 설정](#환경-설정)
3. [API 통신 가이드](#api-통신-가이드)
4. [인증 시스템](#인증-시스템)
5. [페이지별 구현 가이드](#페이지별-구현-가이드)
6. [에러 처리](#에러-처리)
7. [상태 관리](#상태-관리)

---

## 🏗 프로젝트 구조

### 권장 디렉토리 구조
```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── api/                    # API 통신 레이어
│   │   ├── axios.ts           # Axios 인스턴스 설정
│   │   ├── auth.api.ts        # 인증 관련 API
│   │   ├── store.api.ts       # 매장 관련 API
│   │   ├── reservation.api.ts # 예약 관련 API
│   │   ├── payment.api.ts     # 결제 관련 API
│   │   ├── review.api.ts      # 리뷰 관련 API
│   │   └── member.api.ts      # 회원 관련 API
│   │
│   ├── components/             # 재사용 가능한 컴포넌트
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Loading.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── store/
│   │   │   ├── StoreCard.tsx
│   │   │   ├── StoreList.tsx
│   │   │   └── StoreDetail.tsx
│   │   ├── reservation/
│   │   │   ├── ReservationCard.tsx
│   │   │   └── ReservationForm.tsx
│   │   └── review/
│   │       └── ReviewList.tsx
│   │
│   ├── pages/                  # 페이지 컴포넌트
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── SignupPage.tsx
│   │   │   └── OAuth2CallbackPage.tsx
│   │   ├── store/
│   │   │   ├── StoreListPage.tsx
│   │   │   ├── StoreDetailPage.tsx
│   │   │   ├── StoreRegisterPage.tsx
│   │   │   └── StoreEditPage.tsx
│   │   ├── reservation/
│   │   │   ├── MyReservationsPage.tsx
│   │   │   └── ReservationDetailPage.tsx
│   │   ├── payment/
│   │   │   └── PaymentPage.tsx
│   │   ├── mypage/
│   │   │   └── MyPage.tsx
│   │   └── HomePage.tsx
│   │
│   ├── hooks/                  # Custom Hooks
│   │   ├── useAuth.ts
│   │   ├── useStores.ts
│   │   ├── useReservations.ts
│   │   └── usePayment.ts
│   │
│   ├── store/                  # 상태 관리 (Zustand/Redux)
│   │   ├── authStore.ts
│   │   ├── storeStore.ts
│   │   └── cartStore.ts
│   │
│   ├── types/                  # TypeScript 타입 정의
│   │   ├── api.types.ts
│   │   ├── auth.types.ts
│   │   ├── store.types.ts
│   │   ├── reservation.types.ts
│   │   └── common.types.ts
│   │
│   ├── utils/                  # 유틸리티 함수
│   │   ├── dateUtils.ts
│   │   ├── formatUtils.ts
│   │   └── validators.ts
│   │
│   ├── App.tsx
│   ├── Router.tsx
│   └── index.tsx
│
├── package.json
├── tsconfig.json
└── vite.config.ts (or webpack.config.js)
```

---

## ⚙️ 환경 설정

### 1. 프로젝트 생성
```bash
# Vite 사용 (권장)
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# 또는 Create React App
npx create-react-app frontend --template typescript
cd frontend
```

### 2. 필수 패키지 설치
```bash
# API 통신
npm install axios

# 라우팅
npm install react-router-dom
npm install -D @types/react-router-dom

# 상태 관리 (택 1)
npm install zustand        # 추천: 간단하고 가벼움
# 또는
npm install @reduxjs/toolkit react-redux

# UI 라이브러리 (택 1)
npm install @mui/material @emotion/react @emotion/styled  # Material-UI
# 또는
npm install antd                                          # Ant Design
# 또는
npm install tailwindcss postcss autoprefixer              # Tailwind CSS

# 폼 관리
npm install react-hook-form
npm install yup @hookform/resolvers  # 유효성 검사

# 날짜 처리
npm install date-fns

# 결제 (포트원)
# 별도 스크립트 로드 사용

# 유틸리티
npm install clsx  # 클래스명 조합
```

### 3. 환경 변수 설정
```env
# .env.development
VITE_API_BASE_URL=http://localhost:8080/api
VITE_OAUTH2_REDIRECT_URI=http://localhost:5173/oauth2/callback

# .env.production
VITE_API_BASE_URL=https://your-api-domain.com/api
VITE_OAUTH2_REDIRECT_URI=https://your-domain.com/oauth2/callback
```

---

## 🔌 API 통신 가이드

### 1. Axios 인스턴스 설정

**`src/api/axios.ts`**
```typescript
import axios, { AxiosError } from 'axios';

// Axios 인스턴스 생성
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  withCredentials: true,  // 쿠키 전송 (JWT)
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터 (JWT 토큰 자동 추가)
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 응답 인터셉터 (에러 처리 & 토큰 갱신)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config;

    // 401 에러 && 토큰 갱신 시도 안 했으면
    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;

      try {
        // 리프레시 토큰으로 재발급
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/token`,
          {},
          { withCredentials: true }
        );

        setAccessToken(data.data.accessToken);

        // 원래 요청 재시도
        if (originalRequest) {
          originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // 리프레시 토큰도 만료됨 → 로그아웃
        removeTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// 토큰 관리 함수
function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

function setAccessToken(token: string): void {
  localStorage.getItem('access_token', token);
}

function removeTokens(): void {
  localStorage.removeItem('access_token');
}

// API 에러 응답 타입
export interface ApiErrorResponse {
  success: false;
  message: string;
  timestamp: string;
}

// API 성공 응답 타입
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string;
  timestamp: string;
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    _retry?: boolean;
  }
}
```

### 2. API 함수 예시

**`src/api/auth.api.ts`**
```typescript
import { api, ApiSuccessResponse } from './axios';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  memberInfo: {
    id: number;
    name: string;
    email: string;
    role: 'USER' | 'BUSINESS' | 'ADMIN';
  };
}

export const authApi = {
  // 일반 로그인
  login: async (data: LoginRequest) => {
    const response = await api.post<ApiSuccessResponse<LoginResponse>>(
      '/auth/login',
      data
    );
    return response.data;
  },

  // 회원가입
  signup: async (data: SignupRequest) => {
    const response = await api.post<ApiSuccessResponse<void>>(
      '/auth/signup',
      data
    );
    return response.data;
  },

  // 로그아웃
  logout: async () => {
    const response = await api.post<ApiSuccessResponse<void>>('/auth/logout');
    return response.data;
  },

  // 이메일 인증 코드 발송
  sendEmailVerification: async (email: string) => {
    const response = await api.post<ApiSuccessResponse<void>>(
      '/email/send-verification',
      { email }
    );
    return response.data;
  },

  // 이메일 인증 코드 확인
  verifyEmail: async (email: string, code: string) => {
    const response = await api.post<ApiSuccessResponse<void>>(
      '/email/verify',
      { email, verificationCode: code }
    );
    return response.data;
  },
};
```

**`src/api/store.api.ts`**
```typescript
import { api, ApiSuccessResponse } from './axios';
import { Store, StoreDetail } from '../types/store.types';

export const storeApi = {
  // 매장 목록 조회
  getStores: async (params?: { keyword?: string; sort?: string }) => {
    const response = await api.get<ApiSuccessResponse<Store[]>>('/stores', {
      params,
    });
    return response.data;
  },

  // 매장 상세 조회
  getStoreDetail: async (id: number) => {
    const response = await api.get<ApiSuccessResponse<StoreDetail>>(
      `/stores/${id}`
    );
    return response.data;
  },

  // 매장 등록 (사업자만)
  createStore: async (formData: FormData) => {
    const response = await api.post<ApiSuccessResponse<Store>>(
      '/stores',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  },

  // 매장 수정
  updateStore: async (id: number, formData: FormData) => {
    const response = await api.put<ApiSuccessResponse<Store>>(
      `/stores/${id}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  },

  // 매장 삭제
  deleteStore: async (id: number) => {
    const response = await api.delete<ApiSuccessResponse<void>>(
      `/stores/${id}`
    );
    return response.data;
  },
};
```

**`src/api/reservation.api.ts`**
```typescript
import { api, ApiSuccessResponse } from './axios';
import { Reservation, ReservationCreate } from '../types/reservation.types';

export const reservationApi = {
  // 예약 생성
  createReservation: async (data: ReservationCreate) => {
    const response = await api.post<ApiSuccessResponse<Reservation>>(
      '/reservations',
      data
    );
    return response.data;
  },

  // 내 예약 목록
  getMyReservations: async () => {
    const response = await api.get<ApiSuccessResponse<Reservation[]>>(
      '/reservations/my'
    );
    return response.data;
  },

  // 예약 상세
  getReservation: async (id: number) => {
    const response = await api.get<ApiSuccessResponse<Reservation>>(
      `/reservations/${id}`
    );
    return response.data;
  },

  // 예약 취소
  cancelReservation: async (id: number) => {
    const response = await api.patch<ApiSuccessResponse<void>>(
      `/reservations/${id}/cancel`
    );
    return response.data;
  },

  // 예약 승인 (사업자용)
  approveReservation: async (id: number) => {
    const response = await api.patch<ApiSuccessResponse<void>>(
      `/reservations/${id}/approve`
    );
    return response.data;
  },

  // 예약 거절 (사업자용)
  rejectReservation: async (id: number, reason: string) => {
    const response = await api.patch<ApiSuccessResponse<void>>(
      `/reservations/${id}/reject`,
      { rejectionReason: reason }
    );
    return response.data;
  },
};
```

---

## 🔐 인증 시스템

### 1. OAuth2 콜백 페이지

**`src/pages/auth/OAuth2CallbackPage.tsx`**
```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function OAuth2CallbackPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    // 쿠키에서 토큰 읽기
    const accessToken = getCookie('access_token');
    const refreshToken = getCookie('refresh_token');

    if (accessToken && refreshToken) {
      // 로컬 스토리지에 저장
      localStorage.setItem('access_token', accessToken);
      
      // 쿠키 삭제 (보안)
      deleteCookie('access_token');
      deleteCookie('refresh_token');

      // 상태 업데이트
      setAuth(accessToken);

      // 메인 페이지로 이동
      navigate('/', { replace: true });
    } else {
      // 토큰 없으면 로그인 페이지로
      navigate('/login', { replace: true });
    }
  }, [navigate, setAuth]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">로그인 처리 중...</p>
      </div>
    </div>
  );
}

// 쿠키 유틸 함수
function getCookie(name: string): string | null {
  const matches = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
  );
  return matches ? decodeURIComponent(matches[1]) : null;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}
```

### 2. 로그인 페이지

**`src/pages/auth/LoginPage.tsx`**
```typescript
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/authStore';

const schema = yup.object({
  email: yup.string().email('이메일 형식이 올바르지 않습니다').required('이메일을 입력해주세요'),
  password: yup.string().min(8, '비밀번호는 8자 이상이어야 합니다').required('비밀번호를 입력해주세요'),
});

type FormData = yup.InferType<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: yupResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      setError('');
      const response = await authApi.login(data);
      
      // 토큰 저장
      localStorage.setItem('access_token', response.data.accessToken);
      
      // 상태 업데이트
      setAuth(response.data.accessToken);

      // 메인 페이지로 이동
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || '로그인에 실패했습니다.');
    }
  };

  const handleSocialLogin = (provider: 'google' | 'naver' | 'kakao') => {
    // 백엔드 OAuth2 엔드포인트로 리다이렉트
    window.location.href = `http://localhost:8080/oauth2/authorization/${provider}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            로그인
          </h2>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">이메일</label>
              <input
                id="email"
                type="email"
                {...register('email')}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="이메일"
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.reservationTime.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">인원</label>
          <input
            type="number"
            min="1"
            max="10"
            {...register('guestCount', {
              required: '인원을 입력해주세요',
              min: { value: 1, message: '최소 1명' },
              max: { value: 10, message: '최대 10명' },
            })}
            className="w-full px-4 py-2 border rounded-lg"
          />
          {errors.guestCount && (
            <p className="text-red-500 text-sm mt-1">{errors.guestCount.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">요청사항 (선택)</label>
          <textarea
            {...register('specialRequest')}
            rows={4}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="특별한 요청사항이 있으시면 입력해주세요"
          />
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 border rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? '예약 중...' : '예약하기'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## ⚠️ 에러 처리

### 1. 에러 타입 정의

**`src/types/error.types.ts`**
```typescript
export interface ApiError {
  success: false;
  message: string;
  timestamp: string;
}

export class NetworkError extends Error {
  constructor(message: string = '네트워크 오류가 발생했습니다.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = '인증이 필요합니다.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = '권한이 없습니다.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}
```

### 2. 에러 핸들링 Hook

**`src/hooks/useErrorHandler.ts`**
```typescript
import { useCallback } from 'react';
import { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../types/error.types';

export function useErrorHandler() {
  const navigate = useNavigate();

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof AxiosError) {
        const apiError = error.response?.data as ApiError;
        const status = error.response?.status;

        switch (status) {
          case 401:
            // 인증 실패 → 로그인 페이지
            navigate('/login');
            return '로그인이 필요합니다.';

          case 403:
            // 권한 없음
            return apiError?.message || '접근 권한이 없습니다.';

          case 404:
            // Not Found
            return apiError?.message || '요청한 리소스를 찾을 수 없습니다.';

          case 409:
            // Conflict (이메일 중복 등)
            return apiError?.message || '이미 존재하는 데이터입니다.';

          case 500:
            // Server Error
            return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

          default:
            return apiError?.message || '오류가 발생했습니다.';
        }
      }

      return '알 수 없는 오류가 발생했습니다.';
    },
    [navigate]
  );

  return { handleError };
}
```

---

## 🏪 상태 관리 (Zustand 예시)

**`src/store/authStore.ts`**
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'USER' | 'BUSINESS' | 'ADMIN';
  } | null;
  isAuthenticated: boolean;
  setAuth: (token: string) => void;
  setUser: (user: AuthState['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token) => set({ accessToken: token, isAuthenticated: true }),

      setUser: (user) => set({ user }),

      logout: () => {
        localStorage.removeItem('access_token');
        set({ accessToken: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

---

## 🎨 UI 컴포넌트 예시

### StoreCard 컴포넌트
```typescript
import { Link } from 'react-router-dom';
import { Store } from '../../types/store.types';

interface StoreCardProps {
  store: Store;
}

export default function StoreCard({ store }: StoreCardProps) {
  return (
    <Link
      to={`/stores/${store.id}`}
      className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
    >
      <div className="aspect-w-16 aspect-h-9">
        <img
          src={store.mainImageUrl || '/placeholder.jpg'}
          alt={store.name}
          className="w-full h-48 object-cover"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">{store.name}</h3>
        <p className="text-gray-600 text-sm mb-2 line-clamp-2">
          {store.description}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-yellow-500">★</span>
            <span className="ml-1 text-sm font-medium">
              {store.rating?.toFixed(1) || 'N/A'}
            </span>
            <span className="ml-1 text-sm text-gray-500">
              ({store.reviewCount})
            </span>
          </div>
          <span className="text-sm text-gray-500">{store.category}</span>
        </div>
      </div>
    </Link>
  );
}
```

---

## 📌 TypeScript 타입 정의

**`src/types/store.types.ts`**
```typescript
export interface Store {
  id: number;
  name: string;
  description: string;
  address: string;
  phone: string;
  category: string;
  mainImageUrl: string;
  rating: number;
  reviewCount: number;
  keywords: string[];
}

export interface StoreDetail extends Store {
  detailImages: string[];
  openTime: string;
  closeTime: string;
  noShowDeposit: number;
  fullRefundDays: number;
  partialRefundDays: number;
  partialRefundRate: number;
}
```

**`src/types/reservation.types.ts`**
```typescript
export interface Reservation {
  id: number;
  storeId: number;
  storeName: string;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  status: ReservationStatus;
  specialRequest?: string;
  rejectionReason?: string;
  depositPaid: boolean;
  depositAmount: number;
  createdAt: string;
}

export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface ReservationCreate {
  storeId: number;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  specialRequest?: string;
}
```

---

## 🚀 라우터 설정

**`src/Router.tsx`**
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import OAuth2CallbackPage from './pages/auth/OAuth2CallbackPage';
import StoreListPage from './pages/store/StoreListPage';
import StoreDetailPage from './pages/store/StoreDetailPage';
import PrivateRoute from './components/PrivateRoute';

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
        
        <Route path="/stores" element={<StoreListPage />} />
        <Route path="/stores/:id" element={<StoreDetailPage />} />
        
        <Route element={<PrivateRoute />}>
          <Route path="/reservations/my" element={<MyReservationsPage />} />
          <Route path="/mypage" element={<MyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 📝 체크리스트

### 필수 구현 사항
- [ ] API 통신 레이어 구축
- [ ] JWT 토큰 관리 (Axios 인터셉터)
- [ ] OAuth2 콜백 처리
- [ ] 로그인/회원가입 페이지
- [ ] 매장 목록/상세 페이지
- [ ] 예약 생성/목록/상세 페이지
- [ ] 에러 처리 시스템
- [ ] 로딩 상태 관리

### 권장 구현 사항
- [ ] React Query로 서버 상태 관리
- [ ] 무한 스크롤 (매장 목록)
- [ ] 이미지 최적화 (Lazy Loading)
- [ ] PWA 지원
- [ ] 다크 모드
- [ ] 반응형 디자인

---

**작성자**: Claude  
**백엔드 API**: Spring Boot 3.5.6  
**권장 프론트엔드**: React 18 + TypeScript + Vite">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="sr-only">비밀번호</label>
              <input
                id="password"
                type="password"
                {...register('password')}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="비밀번호"
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">{errors.reservationTime.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">인원</label>
          <input
            type="number"
            min="1"
            max="10"
            {...register('guestCount', {
              required: '인원을 입력해주세요',
              min: { value: 1, message: '최소 1명' },
              max: { value: 10, message: '최대 10명' },
            })}
            className="w-full px-4 py-2 border rounded-lg"
          />
          {errors.guestCount && (
            <p className="text-red-500 text-sm mt-1">{errors.guestCount.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">요청사항 (선택)</label>
          <textarea
            {...register('specialRequest')}
            rows={4}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="특별한 요청사항이 있으시면 입력해주세요"
          />
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 border rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? '예약 중...' : '예약하기'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## ⚠️ 에러 처리

### 1. 에러 타입 정의

**`src/types/error.types.ts`**
```typescript
export interface ApiError {
  success: false;
  message: string;
  timestamp: string;
}

export class NetworkError extends Error {
  constructor(message: string = '네트워크 오류가 발생했습니다.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = '인증이 필요합니다.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = '권한이 없습니다.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}
```

### 2. 에러 핸들링 Hook

**`src/hooks/useErrorHandler.ts`**
```typescript
import { useCallback } from 'react';
import { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../types/error.types';

export function useErrorHandler() {
  const navigate = useNavigate();

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof AxiosError) {
        const apiError = error.response?.data as ApiError;
        const status = error.response?.status;

        switch (status) {
          case 401:
            // 인증 실패 → 로그인 페이지
            navigate('/login');
            return '로그인이 필요합니다.';

          case 403:
            // 권한 없음
            return apiError?.message || '접근 권한이 없습니다.';

          case 404:
            // Not Found
            return apiError?.message || '요청한 리소스를 찾을 수 없습니다.';

          case 409:
            // Conflict (이메일 중복 등)
            return apiError?.message || '이미 존재하는 데이터입니다.';

          case 500:
            // Server Error
            return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

          default:
            return apiError?.message || '오류가 발생했습니다.';
        }
      }

      return '알 수 없는 오류가 발생했습니다.';
    },
    [navigate]
  );

  return { handleError };
}
```

---

## 🏪 상태 관리 (Zustand 예시)

**`src/store/authStore.ts`**
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'USER' | 'BUSINESS' | 'ADMIN';
  } | null;
  isAuthenticated: boolean;
  setAuth: (token: string) => void;
  setUser: (user: AuthState['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token) => set({ accessToken: token, isAuthenticated: true }),

      setUser: (user) => set({ user }),

      logout: () => {
        localStorage.removeItem('access_token');
        set({ accessToken: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

---

## 🎨 UI 컴포넌트 예시

### StoreCard 컴포넌트
```typescript
import { Link } from 'react-router-dom';
import { Store } from '../../types/store.types';

interface StoreCardProps {
  store: Store;
}

export default function StoreCard({ store }: StoreCardProps) {
  return (
    <Link
      to={`/stores/${store.id}`}
      className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
    >
      <div className="aspect-w-16 aspect-h-9">
        <img
          src={store.mainImageUrl || '/placeholder.jpg'}
          alt={store.name}
          className="w-full h-48 object-cover"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">{store.name}</h3>
        <p className="text-gray-600 text-sm mb-2 line-clamp-2">
          {store.description}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-yellow-500">★</span>
            <span className="ml-1 text-sm font-medium">
              {store.rating?.toFixed(1) || 'N/A'}
            </span>
            <span className="ml-1 text-sm text-gray-500">
              ({store.reviewCount})
            </span>
          </div>
          <span className="text-sm text-gray-500">{store.category}</span>
        </div>
      </div>
    </Link>
  );
}
```

---

## 📌 TypeScript 타입 정의

**`src/types/store.types.ts`**
```typescript
export interface Store {
  id: number;
  name: string;
  description: string;
  address: string;
  phone: string;
  category: string;
  mainImageUrl: string;
  rating: number;
  reviewCount: number;
  keywords: string[];
}

export interface StoreDetail extends Store {
  detailImages: string[];
  openTime: string;
  closeTime: string;
  noShowDeposit: number;
  fullRefundDays: number;
  partialRefundDays: number;
  partialRefundRate: number;
}
```

**`src/types/reservation.types.ts`**
```typescript
export interface Reservation {
  id: number;
  storeId: number;
  storeName: string;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  status: ReservationStatus;
  specialRequest?: string;
  rejectionReason?: string;
  depositPaid: boolean;
  depositAmount: number;
  createdAt: string;
}

export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface ReservationCreate {
  storeId: number;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  specialRequest?: string;
}
```

---

## 🚀 라우터 설정

**`src/Router.tsx`**
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import OAuth2CallbackPage from './pages/auth/OAuth2CallbackPage';
import StoreListPage from './pages/store/StoreListPage';
import StoreDetailPage from './pages/store/StoreDetailPage';
import PrivateRoute from './components/PrivateRoute';

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
        
        <Route path="/stores" element={<StoreListPage />} />
        <Route path="/stores/:id" element={<StoreDetailPage />} />
        
        <Route element={<PrivateRoute />}>
          <Route path="/reservations/my" element={<MyReservationsPage />} />
          <Route path="/mypage" element={<MyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 📝 체크리스트

### 필수 구현 사항
- [ ] API 통신 레이어 구축
- [ ] JWT 토큰 관리 (Axios 인터셉터)
- [ ] OAuth2 콜백 처리
- [ ] 로그인/회원가입 페이지
- [ ] 매장 목록/상세 페이지
- [ ] 예약 생성/목록/상세 페이지
- [ ] 에러 처리 시스템
- [ ] 로딩 상태 관리

### 권장 구현 사항
- [ ] React Query로 서버 상태 관리
- [ ] 무한 스크롤 (매장 목록)
- [ ] 이미지 최적화 (Lazy Loading)
- [ ] PWA 지원
- [ ] 다크 모드
- [ ] 반응형 디자인

---

**작성자**: Claude  
**백엔드 API**: Spring Boot 3.5.6  
**권장 프론트엔드**: React 18 + TypeScript + Vite">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? '로그인 중...' : '로그인'}
            </button>
          </div>

          <div className="text-center">
            <Link to="/signup" className="text-sm text-blue-600 hover:text-blue-500">
              회원가입
            </Link>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">또는</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <button
              onClick={() => handleSocialLogin('google')}
              className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              Google
            </button>
            <button
              onClick={() => handleSocialLogin('naver')}
              className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              Naver
            </button>
            <button
              onClick={() => handleSocialLogin('kakao')}
              className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              Kakao
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 📄 페이지별 구현 가이드

### 1. 매장 목록 페이지

**`src/pages/store/StoreListPage.tsx`**
```typescript
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { storeApi } from '../../api/store.api';
import { Store } from '../../types/store.types';
import StoreCard from '../../components/store/StoreCard';

export default function StoreListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');

  useEffect(() => {
    fetchStores();
  }, [searchParams]);

  const fetchStores = async () => {
    try {
      setLoading(true);
      const response = await storeApi.getStores({
        keyword: searchParams.get('keyword') || undefined,
        sort: searchParams.get('sort') || 'rating',
      });
      setStores(response.data);
    } catch (error) {
      console.error('매장 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ keyword });
  };

  if (loading) {
    return <div>로딩 중...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">매장 목록</h1>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="매장 검색..."
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            검색
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
      </div>

      {stores.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          검색 결과가 없습니다.
        </div>
      )}
    </div>
  );
}
```

### 2. 예약 페이지

**`src/pages/reservation/CreateReservationPage.tsx`**
```typescript
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { reservationApi } from '../../api/reservation.api';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface ReservationFormData {
  reservationDate: Date;
  reservationTime: string;
  guestCount: number;
  specialRequest?: string;
}

export default function CreateReservationPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReservationFormData>();

  const onSubmit = async (data: ReservationFormData) => {
    try {
      const response = await reservationApi.createReservation({
        storeId: Number(storeId),
        reservationDate: format(data.reservationDate, 'yyyy-MM-dd'),
        reservationTime: data.reservationTime,
        guestCount: data.guestCount,
        specialRequest: data.specialRequest,
      });

      alert('예약이 완료되었습니다!');
      navigate(`/reservations/${response.data.id}`);
    } catch (error: any) {
      alert(error.response?.data?.message || '예약에 실패했습니다.');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">예약하기</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">예약 날짜</label>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => setSelectedDate(date || new Date())}
            minDate={new Date()}
            dateFormat="yyyy-MM-dd"
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">예약 시간</label>
          <select
            {...register('reservationTime', { required: '시간을 선택해주세요' })}
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="">시간 선택</option>
            <option value="11:00">11:00</option>
            <option value="12:00">12:00</option>
            <option value="13:00">13:00</option>
            <option value="18:00">18:00</option>
            <option value="19:00">19:00</option>
            <option value="20:00">20:00</option>
          </select>
          {errors.reservationTime && (
            <p className="text-red-500 text-sm mt-1">{errors.reservationTime.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">인원</label>
          <input
            type="number"
            min="1"
            max="10"
            {...register('guestCount', {
              required: '인원을 입력해주세요',
              min: { value: 1, message: '최소 1명' },
              max: { value: 10, message: '최대 10명' },
            })}
            className="w-full px-4 py-2 border rounded-lg"
          />
          {errors.guestCount && (
            <p className="text-red-500 text-sm mt-1">{errors.guestCount.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">요청사항 (선택)</label>
          <textarea
            {...register('specialRequest')}
            rows={4}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="특별한 요청사항이 있으시면 입력해주세요"
          />
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 border rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? '예약 중...' : '예약하기'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## ⚠️ 에러 처리

### 1. 에러 타입 정의

**`src/types/error.types.ts`**
```typescript
export interface ApiError {
  success: false;
  message: string;
  timestamp: string;
}

export class NetworkError extends Error {
  constructor(message: string = '네트워크 오류가 발생했습니다.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = '인증이 필요합니다.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = '권한이 없습니다.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}
```

### 2. 에러 핸들링 Hook

**`src/hooks/useErrorHandler.ts`**
```typescript
import { useCallback } from 'react';
import { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../types/error.types';

export function useErrorHandler() {
  const navigate = useNavigate();

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof AxiosError) {
        const apiError = error.response?.data as ApiError;
        const status = error.response?.status;

        switch (status) {
          case 401:
            // 인증 실패 → 로그인 페이지
            navigate('/login');
            return '로그인이 필요합니다.';

          case 403:
            // 권한 없음
            return apiError?.message || '접근 권한이 없습니다.';

          case 404:
            // Not Found
            return apiError?.message || '요청한 리소스를 찾을 수 없습니다.';

          case 409:
            // Conflict (이메일 중복 등)
            return apiError?.message || '이미 존재하는 데이터입니다.';

          case 500:
            // Server Error
            return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

          default:
            return apiError?.message || '오류가 발생했습니다.';
        }
      }

      return '알 수 없는 오류가 발생했습니다.';
    },
    [navigate]
  );

  return { handleError };
}
```

---

## 🏪 상태 관리 (Zustand 예시)

**`src/store/authStore.ts`**
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'USER' | 'BUSINESS' | 'ADMIN';
  } | null;
  isAuthenticated: boolean;
  setAuth: (token: string) => void;
  setUser: (user: AuthState['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token) => set({ accessToken: token, isAuthenticated: true }),

      setUser: (user) => set({ user }),

      logout: () => {
        localStorage.removeItem('access_token');
        set({ accessToken: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

---

## 🎨 UI 컴포넌트 예시

### StoreCard 컴포넌트
```typescript
import { Link } from 'react-router-dom';
import { Store } from '../../types/store.types';

interface StoreCardProps {
  store: Store;
}

export default function StoreCard({ store }: StoreCardProps) {
  return (
    <Link
      to={`/stores/${store.id}`}
      className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
    >
      <div className="aspect-w-16 aspect-h-9">
        <img
          src={store.mainImageUrl || '/placeholder.jpg'}
          alt={store.name}
          className="w-full h-48 object-cover"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">{store.name}</h3>
        <p className="text-gray-600 text-sm mb-2 line-clamp-2">
          {store.description}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-yellow-500">★</span>
            <span className="ml-1 text-sm font-medium">
              {store.rating?.toFixed(1) || 'N/A'}
            </span>
            <span className="ml-1 text-sm text-gray-500">
              ({store.reviewCount})
            </span>
          </div>
          <span className="text-sm text-gray-500">{store.category}</span>
        </div>
      </div>
    </Link>
  );
}
```

---

## 📌 TypeScript 타입 정의

**`src/types/store.types.ts`**
```typescript
export interface Store {
  id: number;
  name: string;
  description: string;
  address: string;
  phone: string;
  category: string;
  mainImageUrl: string;
  rating: number;
  reviewCount: number;
  keywords: string[];
}

export interface StoreDetail extends Store {
  detailImages: string[];
  openTime: string;
  closeTime: string;
  noShowDeposit: number;
  fullRefundDays: number;
  partialRefundDays: number;
  partialRefundRate: number;
}
```

**`src/types/reservation.types.ts`**
```typescript
export interface Reservation {
  id: number;
  storeId: number;
  storeName: string;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  status: ReservationStatus;
  specialRequest?: string;
  rejectionReason?: string;
  depositPaid: boolean;
  depositAmount: number;
  createdAt: string;
}

export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface ReservationCreate {
  storeId: number;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  specialRequest?: string;
}
```

---

## 🚀 라우터 설정

**`src/Router.tsx`**
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import OAuth2CallbackPage from './pages/auth/OAuth2CallbackPage';
import StoreListPage from './pages/store/StoreListPage';
import StoreDetailPage from './pages/store/StoreDetailPage';
import PrivateRoute from './components/PrivateRoute';

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
        
        <Route path="/stores" element={<StoreListPage />} />
        <Route path="/stores/:id" element={<StoreDetailPage />} />
        
        <Route element={<PrivateRoute />}>
          <Route path="/reservations/my" element={<MyReservationsPage />} />
          <Route path="/mypage" element={<MyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 📝 체크리스트

### 필수 구현 사항
- [ ] API 통신 레이어 구축
- [ ] JWT 토큰 관리 (Axios 인터셉터)
- [ ] OAuth2 콜백 처리
- [ ] 로그인/회원가입 페이지
- [ ] 매장 목록/상세 페이지
- [ ] 예약 생성/목록/상세 페이지
- [ ] 에러 처리 시스템
- [ ] 로딩 상태 관리

### 권장 구현 사항
- [ ] React Query로 서버 상태 관리
- [ ] 무한 스크롤 (매장 목록)
- [ ] 이미지 최적화 (Lazy Loading)
- [ ] PWA 지원
- [ ] 다크 모드
- [ ] 반응형 디자인

---

**작성자**: Claude  
**백엔드 API**: Spring Boot 3.5.6  
**권장 프론트엔드**: React 18 + TypeScript + Vite