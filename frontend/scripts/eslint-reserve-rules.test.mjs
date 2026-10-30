import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Linter } from 'eslint';
import { rules } from './eslint-reserve-rules.mjs';

const lint = (source) => new Linter().verify(source, [{
    languageOptions: { ecmaVersion: 'latest', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { reserve: { rules } },
    rules: { 'reserve/plain-jsdoc': 'error', 'reserve/no-jsx-style-tag': 'error' },
}]);

test('Java-only markup and HTML headings are reported in comments', () => {
    assert.equal(lint('/** {@code amount} */ const x = 1;').length, 1);
    assert.equal(lint('/** <h3>History</h3> */ const x = 1;').length, 1);
});

test('normal JSDoc, JSX headings and quoted examples are not comments', () => {
    assert.deepEqual(lint('/** @param {number} amount - Expected amount. */ function pay(amount) {}'), []);
    assert.deepEqual(lint('const x = <h3>Title</h3>; const example = "{@code example}";'), []);
});

test('global style elements are rejected but instance style props remain allowed', () => {
    assert.equal(lint('const x = <style>{"body { color: red; }"}</style>;').length, 1);
    assert.deepEqual(lint('const x = <div style={{ opacity: 1 }} />;'), []);
});

const lintCopy = (source, filename = 'src/pages/Home.jsx') => new Linter().verify(source, [{
    files: ['**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 'latest', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { reserve: { rules } },
    rules: { 'reserve/user-copy-tone': 'error', 'reserve/no-threatening-copy': 'error' },
}], { filename });

test('copy policy checks text, template messages and JSX while allowing labels and comments', () => {
    for (const source of ['const text = "저장되었습니다.";', 'const text = `${count}건 있습니다`;',
        'const text = <p>처리하시겠습니까?</p>;']) {
        assert.equal(lintCopy(source).length, 1);
    }
    assert.deepEqual(lintCopy('// 저장되었습니다.\nconst text = <p>저장됐어요.</p>; const label = "저장";'), []);
});

test('legal pages may use formal text but cannot introduce legal threats', () => {
    assert.deepEqual(lintCopy('const text = "90일 보관합니다.";', 'src/pages/legal/Privacy.jsx'), []);
    assert.deepEqual(lintCopy('const text = <p>출처와 이용 조건을 안내합니다.</p>;', 'src/pages/legal/ContentSources.jsx'), []);
    assert.equal(lintCopy('const text = <p>법적 조치를 취합니다.</p>;', 'src/pages/legal/ContentSources.jsx').length, 1);
    assert.equal(lintCopy('const text = <p>이용 방법을 안내합니다.</p>;', 'src/pages/legal/UserGuide.jsx').length, 1);
    assert.equal(lintCopy('const text = "법적 조치를 취합니다.";', 'src/pages/legal/Terms.jsx').length, 1);
    assert.equal(lintCopy('const text = <p>고소할 수 있어요.</p>;').length, 1);
    assert.deepEqual(lintCopy('const text = <p>고소한 맛과 향이에요.</p>;'), []);
});

test('reservation consent legal notice retains formal copy without exempting ordinary forms', () => {
    assert.deepEqual(lintCopy('const text = <p>개인정보 제공 내용을 안내합니다.</p>;', 'src/pages/legal/ReservationConsentNotice.jsx'), []);
    assert.equal(lintCopy('const text = <p>예약 처리가 완료되었습니다.</p>;', 'src/components/reservation/ReservationConsentField.jsx').length, 1);
});
