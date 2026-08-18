import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // ★ 폼 검증 오류를 토스트로 띄우는 것을 막는다.
      //
      // 왜 lint 로 막는가 — 이 규칙은 원래 FormModal.jsx 주석과 design-system.md 에
      // 글로만 적혀 있었다. FormField 는 진작에 error prop 을 받고 있었는데도,
      // 실제로 그걸 쓰는 파일은 InquiryModal 하나뿐이었고 나머지 폼 8개는 전부
      // message.warning 을 이어 붙이고 있었다. 필터 Select 색·카드 hover 그림자와
      // 정확히 같은 실패 방식이다 — 규칙이 주석에만 있으면 반드시 샌다.
      //
      // 왜 토스트가 안 되는가 — 몇 초 뒤 사라져서 "어느 칸이 틀렸는지" 다시 볼 수 없고,
      // 여러 칸이 틀리면 겹쳐 쌓이며, if/return 으로 이어 붙이면 첫 오류만 알려줘서
      // 고칠 때마다 다음 오류가 나오는 두더지 잡기가 된다.
      //
      // 무엇을 잡는가 — "○○을 입력/선택/업로드/동의해주세요" 와 "…필수입니다" 라는,
      // 이 코드베이스에서 필드 검증 문구가 실제로 쓰는 어미만 본다. 그래서
      // '로그인이 필요한 서비스입니다' · '위치를 가져올 수 없어요' 같은
      // **필드에 귀속되지 않는** 정당한 토스트는 걸리지 않는다.
      // 완벽한 판별은 아니고(변수로 조립한 문구는 못 잡는다) 의도적으로 그렇게 뒀다 —
      // 넓게 잡으면 정당한 토스트까지 막아서 결국 disable 주석이 늘어난다.
      //
      // 대신 뭘 쓰나:
      //   - FormField 를 쓰는 폼  → useFormErrors + <FormField error={...}>
      //   - AntD <Form> 안의 칸   → Form.Item rules 또는 form.setFields([{ name, errors }])
      'no-restricted-syntax': ['error', {
        selector:
          "CallExpression[callee.property.name=/^(warning|error)$/]" +
          " > Literal[value=/(입력|선택|업로드|동의)\\s*해\\s*주세요|필수입니다/]",
        message:
          '폼 검증 오류는 토스트가 아니라 칸 아래 인라인으로 표시하세요. ' +
          'FormField 를 쓰는 폼은 useFormErrors + <FormField error={...}>, ' +
          'AntD Form 안의 칸은 Form.Item rules 또는 form.setFields 를 쓰세요. ' +
          '근거: FormModal.jsx 의 FormField 주석 / docs/technical/design-system.md',
      }],
    },
  },
])
