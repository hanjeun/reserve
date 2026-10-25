import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import { rules as reserveRules } from './scripts/eslint-reserve-rules.mjs'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    plugins: { reserve: { rules: reserveRules } },
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
      'reserve/plain-jsdoc': 'error',
      'reserve/no-jsx-style-tag': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // 목록·상세 조회는 DataState를 사용하고 폼·변경·결제 상태는 각 동작에서 처리한다.

      'no-restricted-imports': ['error', {
        paths: [{
          name: 'antd',
          importNames: ['Alert', 'Empty'],
          message: '조회 결과의 빈 상태·오류 상태는 DataState를 사용하세요. 폼 검증·mutation·결제 결과는 각 동작 경계를 사용합니다.',
        }, {
          name: 'antd',
          importNames: ['Tooltip'],
          message: '설명 말풍선은 common/Tooltip을 사용하세요. 터치 후 남는 말풍선과 키보드 설명을 공통 관문에서 처리합니다.',
        }],
      }],

      // 필드 검증은 FormField 오류나 Form.Item 규칙으로 표시한다.

      'no-restricted-syntax': ['error', {
        selector:
          "CallExpression[callee.property.name=/^(warning|error)$/]" +
          " > Literal[value=/(입력|선택|업로드|동의)\\s*해\\s*주세요|필수(입니다|예요)/]",
        message:
          '폼 검증 오류는 토스트가 아니라 칸 아래 인라인으로 표시하세요. ' +
          'FormField 를 쓰는 폼은 useFormErrors + <FormField error={...}>, ' +
          'AntD Form 안의 칸은 Form.Item rules 또는 form.setFields 를 쓰세요. ' +
          '근거: FormModal.jsx 의 FormField 주석 / docs/technical/design-system.md',
      }],
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**'],
    rules: {
      'reserve/user-copy-tone': 'error',
      'reserve/no-threatening-copy': 'error',
    },
  },
])
