# 서드파티 고지

RESERVE의 코드와 사용한 라이브러리·글꼴·이미지의 권리는 서로 구분돼요. 이 안내는 각 배포물의 원문 라이선스와 저작권 고지를 대신하지 않아요.

## 라이브러리

프론트엔드 빌드는 실제 출력에 사용한 npm 패키지의 LICENSE·NOTICE를 THIRD_PARTY_NOTICES.txt에 포함해요.

백엔드 빌드는 실행 JAR의 원문 고지와 필요한 보충 고지를 META-INF/THIRD_PARTY_NOTICES.txt에 포함해요. [보충 고지 목록](backend/licenses/supplemental.json)은 원문과 해시를 관리하며 누락·변경 시 빌드를 중단해요.

전체 의존성이 한 가지 라이선스나 허용적인 라이선스만 사용한다고 보장하지 않아요. MySQL Connector/J에는 GPLv2와 추가 허용·Universal FOSS Exception이 적용돼요. 바이너리와 이미지의 배포 방식에 맞는 원문 조건을 확인해야 해요.

## 글꼴

| 글꼴 | 라이선스 | 고지 |
|---|---|---|
| Pretendard | OFL-1.1 | npm 패키지의 원문 |
| SUITE | OFL-1.1 | [SUITE-LICENSE.txt](frontend/public/fonts/SUITE-LICENSE.txt) |

글꼴과 함께 원문 라이선스와 저작권 고지를 보존해요.

## 상태 그림과 아이콘

이미지·모델은 납품한 CC0 고지, 제작 코드는 MIT 고지를 유지해요. 이 고지는 AI 보조 산출물의 저작권 성립·독점권·제3자 권리를 보증하거나 상표권을 부여하지 않아요.

- [카메라·브라우저](frontend/src/assets/state-illustrations/source/camera-browser-states-v1/README.md)
- [예약 정책](frontend/src/assets/choice-icons/source/policy-menu-icons-v1/README.md)
- [편집·접수 상태](frontend/src/assets/choice-icons/source/edit-controls-v1/README.md)
- [피드·초안·혜택](frontend/src/assets/state-illustrations/source/community-benefit-states-v2/README.md)

빌드는 카메라·브라우저와 예약 정책의 이미지 고지·CC0 전문·MIT 전문, 피드·초안·혜택의 납품 고지를 함께 포함해요. 지역 사진은 제공자의 출처와 이용 조건을 따르며 [지역 사진 안내](docs/technical/region-photo-assets.md)를 보세요.

## English

RESERVE and its dependencies have separate rights and licenses. This summary does not replace upstream license texts or copyright notices.

Frontend builds include notices from packages used by the output. Backend builds include runtime JAR notices and pinned supplemental texts. Missing or changed supplemental originals fail the build.

Pretendard and SUITE retain their OFL-1.1 notices. Delivered illustration/model notices retain CC0 dedications and production-code MIT notices. Those notices do not warrant copyrightability, exclusivity, third-party rights, or trademark rights in AI-assisted output.

MySQL Connector/J is subject to GPLv2, additional permissions and the Universal FOSS Exception. Applicable original terms and the form of distribution control.
