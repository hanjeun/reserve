## Summary

<!-- English type: subject title. Explain the user-visible problem and scope; body may be Korean. -->

## Changes

<!-- Keep one concern per PR. State what is deliberately deferred. -->
-

## Type

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] chore
- [ ] docs
- [ ] style
- [ ] release

## Verification

<!-- Record exact commands, results, and untested paths. Do not check a box for someone else's older run. -->

| Check | Result / evidence |
|---|---|
| Backend (`./gradlew test`) | Not run / not applicable |
| Frontend (`npm run lint:ci`, `npm run test:policy`, `npm run test:run`, `npm run build`) | Not run / not applicable |
| PC / mobile (`npm run test:e2e`) | Not run / not applicable |
| Real services / operational checks | Not run / not applicable |

## Risk and rollout

<!-- For payments: ownership, duplicate callbacks, unknown PG results, and durable recovery.
For lists: server-side search/count, 101+ rows, stable order, failed-request UI.
For UI: existing design tokens, keyboard access, normal AND reduced motion.
For schema/deploy changes: compatibility, manual DDL, rollback boundary. Mocked tests are not production proof. -->

## Checklist

- [ ] Changes and tests match this PR head; required build checks are present and successful
- [ ] Applicable risks above were verified; limitations are explicitly recorded
- [ ] Comments describe current contracts; docs and release claims match implemented behavior
- [ ] No secrets, credentials, or local config committed
- [ ] Merge method matches the target: merge commit into dev, squash into main

## Related

<!-- Closes #123 -->
