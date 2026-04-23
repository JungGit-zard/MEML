# Codex Project Notes

- 모든 기능 구현 후 즉시 `error-detective.toml` 기준으로 코드 에러와 실패 경로를 검수한다.
- 이어서 Playwright로 실제 사용 흐름을 검증하고, 필요한 회귀 테스트를 추가하거나 갱신한다.
- 코드 검수와 Playwright 검증에서 문제가 없다고 판단될 때만 로컬 Git에 커밋한다.
- 커밋 후 사용자에게 변경 내용, 검증 결과, 커밋 해시를 보고한다.
