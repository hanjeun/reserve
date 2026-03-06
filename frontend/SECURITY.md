## npm audit 취약점 대응

### 방법 1: 자동 수정 (권장)
```bash
npm audit fix
```

### 방법 2: 강제 수정 (메이저 버전 업 포함, 주의)
```bash
npm audit fix --force
```

### 방법 3: package.json overrides (특정 패키지 버전 고정)
아래 내용이 package.json에 추가되어 있습니다:
- `esbuild` >= 0.25.0 (vite 내부 의존성 취약점)

### 수행 절차
터미널에서:
```bash
cd frontend
npm audit        # 취약점 내용 확인
npm audit fix    # 자동 수정 시도
```
