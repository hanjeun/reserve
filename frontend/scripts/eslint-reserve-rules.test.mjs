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
