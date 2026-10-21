# 배포

RESERVE는 GitHub Actions와 Docker Blue/Green 방식으로 배포해요.

## 브랜치

| 브랜치 | 역할 |
|---|---|
| feature·fix·chore | 개별 변경 |
| dev | 변경 통합 |
| main | 운영 배포 |

dev 대상 PR은 merge commit, main 대상 릴리스 PR은 squash를 사용해요. main 릴리스 뒤에는 dev에 main의 계보를 연결해요. 자세한 규칙은 [Git 워크플로](../rules/git-workflow.md)를 보세요.

## 배포 흐름

1. 백엔드·프론트엔드 검사와 필수 보안 검사를 실행해요.
2. 같은 커밋으로 API 이미지와 앱·소개·이전 주소 호환 화면을 만들어요.
3. 새 서버와 화면을 준비하고 정상 응답을 확인해요.
4. Nginx가 API와 화면을 함께 전환해요.
5. 전환 뒤 상태를 확인하고, 실패하면 이전 API와 화면으로 함께 돌아가요.

같은 입력의 성공 검사 결과는 유효한 증거가 있을 때 재사용해요. 필수 빌드와 보안 검사는 유지해요.

## 배포 조건

- 새 서버가 실제 데이터 구조와 호환되어야 해요.
- 운영 앱 계정은 제한된 권한과 스키마 검사 설정(validate)을 사용해요.
- 데이터 구조가 바뀌면 기존 데이터와 복구 버전의 호환성을 확인해요.
- 운영 전환과 데이터·결제·권한 변경은 승인된 범위에서 진행해요.

## 관련 코드

- [GitHub Actions](../../.github/workflows/CICD.yml)
- [Nginx 설정](../../nginx)
- [화면 전환 도구](../../scripts/domain-release.sh)
- [백업과 복구](backup.md)
