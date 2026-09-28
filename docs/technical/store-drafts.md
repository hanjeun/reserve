# 가게 등록·수정 임시저장

가게 등록과 수정 화면은 같은 임시저장 기능을 쓰고, 초안은 브라우저 IndexedDB에만 저장해요.

## 동작

- 회색 보조 버튼은 **임시저장**이에요.
- 입력·이미지 변경이 1초 멈추면 자동 저장하고, 계속 입력해도 최대 5초 안에 한 번은 저장해요.
- 다시 들어오면 저장 시각과 함께 **이어서 작성 / 새로 작성**(등록) 또는 **이어서 작성 / 최신 정보 유지**(수정)를 고르게 해요.
- 새로 작성·최신 정보 유지를 고르거나 최종 등록·수정이 성공하면 초안을 지워요.
- 편집 중 서버 원본이 바뀌면 fingerprint 차이로 감지해 알려 줘요.
- 두 화면은 `useStoreForm`과 `StoreFormActions`를 공유해요.

## 저장 위치

`frontend/src/utils/storeDraftStorage.js`가 IndexedDB `reserve-local-drafts/store-forms`에 저장해요. 키는 회원·모드·가게별이에요.

```text
member:{memberId}:store:create:new
member:{memberId}:store:edit:{storeId}
```

- dayjs 값은 문자열로 저장하고, 새 이미지는 `File/Blob` 그대로 보관해요.
- 초안은 30일 뒤 만료돼요. 가게 폼에 들어올 때 만료된 초안을 함께 정리해요.
- 서버에는 최종 제출 때 multipart 요청 한 번만 보내요.
- 같은 기기·브라우저에서만 이어져요.

## 테스트

- `storeDraftStorage.test.js`: 날짜 직렬화/복원, 회원·모드별 키, 만료 초안 삭제
- `FormDatePicker.test.jsx`: 운영기간 range와 임시휴무 multiple 선택
