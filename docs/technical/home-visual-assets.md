# 홈 이미지 자산과 사진 중심 탐색

2026-09-13 로컬 프리뷰. 운영 배포 기록이 아니다.

## 제작과 사용

- 내장 이미지 생성 도구(built-in mode)로 RESERVE 전용 이미지 18개를 생성했다. 최초 아이콘 10개·모바일 사진 3개·PC 전용 가로 사진 3개에 운영 안내용 모바일·PC 사진 두 장을 추가했다.
- 카테고리·바로가기 10개는 실제 소재가 보이는 입체 물체 컷아웃이다. 투명 RGBA를 유지하며 배경 카드·테두리·원형 판을 사용하지 않는다.
- 배포 경로에는 WebP만 둔다. 생성 원본은 프로젝트 정적 자산으로 배포하지 않으며, 기존 아이콘과 메인 캐러셀도 WebP 자산을 사용한다.
- 배포 자산 위치: `frontend/public/images/discovery-v3/`. 아이콘의 투명 채널은 변환 후에도 유지된다.
- 사진 배너는 서비스 분야 탐색용 오리지널 분위기 이미지다. 실제 입점 가게·실제 판매 상품·실제 이벤트의 사진이라고 주장하지 않는다.
- 분야 아이콘의 표시 폭·높이는 `constants/discovery.js`의 `SERVICE_DOMAIN_IMAGES`에서 홈·검색이 함께 사용한다. 홈 전용 바로가기는 `Home/index.jsx`의 `SHORTCUTS`에서 관리한다. 물체별 42–57px 폭, 44–54px 높이로 광학 균형을 맞춘다.
- 최초 이미지 제작 범위의 링크 목적지는 `/stores?domain=…`, 평점순 탐색, 관심 가게, 내 예약, 메시지였다.
  이후 혜택 탭에는 공개 가게 소식이 별도 구현됐으며, 현재 위치 기능은 추가하지 않았다.

## 레이아웃 참고와 재구현 범위

[캐치테이블](https://app.catchtable.co.kr/)과 [KREAM](https://kream.co.kr/)의 공개 홈·목록·가게/상품 상세 DOM, 주요 컴포넌트의 계산된 CSS, 접근 가능한 CSS 규칙을 확인했다. 전체 사이트 소스나 로그인 뒤 화면을 수집한 것은 아니다. 타사 이미지·로고·CSS 파일은 프로젝트에 복사하지 않았다. 후속 페이지별 실측은 [design-measurements-2026-09-13.md](history/2026-09-preview/design-measurements-2026-09-13.md)에 기록했다.

최초 공개 홈 관측 수치: 앱 최대 폭 480px, 가로 여백 20px, 상단 검색 약 38px 높이/50px radius, 사진 배너 약 1.525 비율, 바로가기 5열/48px 이미지, 고정 하단 5메뉴. 후속 관측에서는 캐치테이블 상단 행 48px·탭 44px, KREAM 상단 주행 64px·탭 44px를 확인했다. RESERVE 홈은 다른 페이지와 같은 64px 공통 헤더와 프레임 없는 개별 컷아웃 크기를 사용한다. 모바일 주요 화면의 헤더는 `RESERVE — 검색 아이콘 — 둥근 프로필 사진`이며 탐색 루트 밖에서는 왼쪽에 뒤로가기가 추가된다. PC도 같은 규칙으로 하위 화면의 뒤로가기와 전체 워드마크를 함께 보인다. 헤더 검색 링크와 별도 `/search` 화면의 입력은 모두 44px 높이/100px 반경이며 PC 입력 최대 폭은 560px다.

홈은 공통 로고/검색창/프로필 사진 → 탐색 탭 → 전체 지역 → 사진 캐러셀 → 분야/바로가기 → 운영 안내 링크 → 실제 가게 목록 순서다. 운영 안내는 공지 API 결과를 요약하는 별도 블록이 아니라 `/operation-guide`로 가는 캐러셀 항목이며, 사진 위에 짧은 HTML 제목·설명을 겹쳐 목적을 명확히 한다. 실패·빈 공지에 따라 홈 레이아웃이 바뀌지 않는다. 자동 재생 대신 직접 넘기기/네이티브 스와이프를 쓰며, 모션 감소 설정에서는 즉시 이동한다. 테마 색은 기존 CSS 토큰을 사용한다. 법적 고지·문의 푸터는 유지한다. 프로필 메뉴와 중복되는 고정 하단 페이지 메뉴 및 보정용 공백은 모든 화면에서 제거했다. 검색 화면에서는 전역 헤더·푸터를 빼 입력에 집중한다. 검색 동작과 범위는 [search-ui.md](search-ui.md)를 참고한다.

## 반응형과 추천 목록

상단 탭은 `홈 · 탐색 · 혜택 · 웨이팅 · 피드`이며 공통 `DiscoveryNav`를 사용한다. 주요 화면에는 유지하고 분야/검색 결과·상세에는 숨긴다. 혜택은 공개 가게 소식 화면이고, 웨이팅·피드는 현재 준비 중 화면이다.

캐치테이블의 480px 최대 폭은 참고 사이트에서 관측한 수치이지 RESERVE의 최종 반응형 정책이 아니다. 사용자 요청에 따라 홈 헤더·본문·푸터는 기존 공통 헤더와 같은 최대 1248px 안에서 화면 너비를 활용한다.

- 모바일(768px 미만): 64px 공통 헤더, 44px 탐색 탭, 5열/2행 바로가기, 1열 추천 목록, 64px 썸네일. 배너는 원본 960×640의 3:2 비율이다. 페이지 선택은 상단 프로필 메뉴를 사용한다.
- 태블릿(768–899px): 64px 공통 헤더와 44px 상단 탐색, 좌우 24px 여백, 80px 썸네일. 배너는 모바일과 같은 3:2 사진 한 장을 보여주고 네이티브 스와이프를 유지한다.
- PC(900px 이상): 헤더는 탐색 루트 밖에서 뒤로가기·전체 RESERVE 워드마크·검색·프로필로 구성한다. 하위 화면에서도 워드마크와 뒤로가기를 함께 보이며, 검색창이 있는 화면에서는 좌우 영역을 같은 폭으로 잡아 중앙에 놓인다.
- PC 사진 배너는 전용 1600×640 자산을 한 장씩 2.5:1 가로형으로 보여준다. 모바일 사진을 늘리거나 긴 가로형으로 잘라 확대하지 않는다. 최대 표시 크기는 1200×480px이며 다음 배너의 잘린 가장자리를 노출하지 않는다. 다음 버튼/페이지 표시는 현재 사진 오른쪽 아래 안에 두고 마지막 사진에서 처음으로 돌아간다. 아래 바로가기는 ‘서비스별로 찾기’ 6개와 ‘빠른 메뉴’ 4개를 두 영역으로 나눈다. 추천 행은 기존 2열, 물체 아이콘은 기존 광학 크기를 유지한다.
- 추천 가게는 별도 큰 카드나 가로 스크롤 레일을 만들지 않는다. 왼쪽 둥근 사진과 오른쪽 이름·소개·평점/리뷰 수·분류/주소로 구성하며, 실제 입점 가게의 서버 응답만 표시한다.
- 긴 문구는 행 안에서 말줄임하고 상세 링크를 유지한다. 로딩은 실제 행과 같은 크기의 `Bone`, 조회 실패는 재시도, 정상 0건은 빈 상태로 구분한다.

화면 변경은 프론트 시각 배치에 한정한다. 기존 추천 조회 인자(첫 페이지 4건·평점순), 인증/계정 메뉴, 검색 결과 API는 바꾸지 않는다.

## PC 가로형 배너 보정

PC에서 포스터 두 장과 잘린 세 번째 사진이 동시에 보이던 구성을 단일 가로 배너로 변경했다. 내장 이미지 생성 도구에 기존 RESERVE 모바일 사진을 각각 편집 참조로 전달하여 같은 소재·빛·분위기를 유지한 PC 전용 구도를 만들었다. 모바일 사진과 10개 컷아웃 아이콘은 이번 보정에서 수정하지 않았다.

| 자산 | 크기 | 용량 |
|---|---|---|
| `dining-cover-desktop-v1.webp` | 1600×640 | 146,894 bytes |
| `class-cover-desktop-v1.webp` | 1600×640 | 80,488 bytes |
| `popup-cover-desktop-v1.webp` | 1600×640 | 38,988 bytes |

원본 생성 PNG는 1983×793이며 아래 위치에 보존했다. 선택된 프로젝트 자산만 Sharp로 1600×640에 맞추고 WebP quality 84 / effort 6으로 변환했다. 사진의 피사체나 배경을 수작업 합성하지 않았다. `Home/index.jsx`의 `picture`가 900px 이상에서 PC 자산을 선택하고 나머지 폭에서는 기존 모바일 자산을 선택한다.

## 운영 안내 사진 링크 (2026-09-23 보정)

홈의 운영 안내는 실시간 공지 요약을 다시 읽는 별도 텍스트 블록 대신 `/operation-guide`로 가는 사진 링크다. 사용자는 사진 전체를 누를 수 있고, 사진의 왼쪽 여백에는 접근 가능한 HTML 제목과 설명을 표시한다. 이미지 파일 자체에는 글자를 굽지 않으며, 사진은 실제 입점 가게나 실제 행사 사진이라고 주장하지 않는다.

| 자산 | 크기 | 용도 |
|---|---:|---|
| `operation-guide-cover-v1.webp` | 1536×1024 | 900px 미만, 3:2 표시 |
| `operation-guide-cover-desktop-v1.webp` | 1983×793 | 900px 이상, 2.5:1 표시 |

### operation-guide-cover-v1.webp — 모바일 최종 프롬프트

```text
Photorealistic editorial photograph for a Korean reservation service operation guide, portrait-friendly 3:2 landscape composition. A warmly sunlit independent Korean service shop before opening: a small handwritten planning notebook, pencil, ceramic cup, clipped appointment card without readable text, linen curtain, real wood counter, healthy plant, and soft afternoon light. One calm, lived-in scene with no staged people. Center the most recognisable materials for a narrow mobile crop; leave gentle natural negative space but not a blank abstract field. Tactile authentic Korean lifestyle magazine photography, warm neutral cream and walnut palette, restrained contrast, believable shadows and materials. No text, logo, watermark, readable writing, phone screen, brand packaging, UI, artificial 3D render, glossy stock photo appearance, or surreal objects. Output only the photograph.
```

### operation-guide-cover-desktop-v1.webp — PC 최종 프롬프트

```text
Photorealistic editorial website hero photograph, wide 2.5:1 composition, for a Korean reservation service operation guide. A warmly sunlit independent Korean service shop just before opening: a real wood counter, small paper appointment notebook, pencil, ceramic cup, plant, linen curtain and a subtle glimpse of a neatly prepared service space. Put the visual subject and warm materials toward the right half; reserve quiet, darker but still natural room on the left for a small HTML label. Candid Korean lifestyle magazine photography: honest imperfections, muted cream and walnut tones, natural daylight, tactile wood and paper, restrained contrast. No people, no logos, no readable text, no brand labels, no watermarks, no phone screen, no UI, no artificial 3D render, no glossy stock photo look, no surreal objects. Output only the photograph.
```

### dining-cover-desktop-v1.webp — 최종 편집 프롬프트

참조: `frontend/public/images/discovery-v3/dining-cover.webp` (기존 RESERVE 모바일 사진).

원본 결과: `C:/Users/USER/.codex/generated_images/01a08bbc-ff00-79d2-ac45-e7b47d74dc5f/exec-fe95f50f-fee1-4e6b-9312-6487ff88bfbf.png`.

```text
Use case: precise-object-edit; photorealistic-natural editorial website banner.
Input Image 1: existing RESERVE mobile dining photograph, the edit target and lighting/material reference.
Primary request: create its DESKTOP wide sibling by expanding and recomposing the same photograph into a 2.5:1 landscape image, approximately 1600x640. Preserve the original natural pasta, cherry tomato and basil dish, cream ceramic plate, dark walnut tabletop, linen and warm window light. The entire plate must be visible on the RIGHT 45% of the canvas with comfortable right and top/bottom margins, not enormous or cropped. The LEFT 45% is dark, open walnut tabletop for HTML white headline overlay, with believable grain and minimal clutter. Keep the original oblique overhead camera angle and restrained realistic photographic texture. Change only the framing/extended background needed for this wider desktop composition. No people, no extra dishes, no lettering, no logo, no watermark, no UI, no fake restaurant signage. Do not stretch the original objects. No synthetic 3D or glossy AI look. Output only the wide photograph, not a website mockup.
```

### class-cover-desktop-v1.webp — 최종 편집 프롬프트

참조: `frontend/public/images/discovery-v3/class-cover.webp` (기존 RESERVE 모바일 사진).

원본 결과: `C:/Users/USER/.codex/generated_images/01a08bbc-ff00-79d2-ac45-e7b47d74dc5f/exec-bdc708c0-914c-4a38-8fde-e5577bc7eb23.png`.

```text
Use case: precise-object-edit; photorealistic-natural editorial website banner.
Input Image 1: existing RESERVE mobile ceramic workshop photograph, the edit target and lighting/material reference.
Primary request: create its DESKTOP wide sibling by expanding and recomposing the same scene into a 2.5:1 landscape image, approximately 1600x640. Preserve the handmade speckled ivory ceramic cup, terracotta cups, small unfinished bowl, clay modeling tools, weathered dark wooden workbench, softly defocused workshop and warm window light. Main still-life objects sit on the RIGHT 45% with intact silhouettes, not oversized, no edge clipping. The LEFT 45% remains quiet darker open workbench and defocused workshop for HTML white headline overlay. Keep the camera angle, tactile imperfect glaze, realistic wood grain and restrained natural color grading. Change only framing/extended background required for desktop. No people, no hands, no extra decorative objects, no lettering, no logos, no watermark, no UI. Do not stretch or distort objects. Avoid synthetic 3D or glossy AI polish. Output only the wide photograph, not a website mockup.
```

### popup-cover-desktop-v1.webp — 최종 편집 프롬프트

참조: `frontend/public/images/discovery-v3/popup-cover.webp` (기존 RESERVE 모바일 사진).

원본 결과: `C:/Users/USER/.codex/generated_images/01a08bbc-ff00-79d2-ac45-e7b47d74dc5f/exec-65c31e2b-35f6-4aaa-8b81-ac086cd77997.png`.

```text
Use case: precise-object-edit; photorealistic-natural editorial website banner.
Input Image 1: existing RESERVE mobile pop-up gallery photograph, the edit target and lighting/material reference.
Primary request: create its DESKTOP wide sibling by expanding and recomposing the same gallery into a 2.5:1 landscape image, approximately 1600x640. Preserve the warm off-white textured plaster wall, low terracotta pedestal, sculptural cream ceramic vase, small cobalt-blue glass object, charcoal shadowed gallery wall, natural sunlight and architecture. Pedestal and BOTH displayed objects are intact on the RIGHT 45% with comfortable margins, never enormous or cut off. The LEFT 45% is quiet darker charcoal gallery space for HTML white headline overlay. Keep the original architectural perspective, real plaster grain and believable natural shadows. Change only framing/extended architecture required for desktop. No people, no extra exhibits, no text, no signage, no logos, no watermark, no UI. Do not stretch the architecture or objects. No synthetic 3D or AI-looking gradients. Output only the wide photograph, not a website mockup.
```

## 최초 생성 프롬프트 세트

아래 공통 프롬프트에 각 항목의 ` Subject:` 문장을 이어 붙인 것이 아이콘별 최종 프롬프트다. 참조 이미지 없이 새로 생성했다.

### 아이콘 공통 프롬프트

```text
Use case: product-mockup. Asset type: an original RESERVE reservation-app category shortcut image, displayed about 52px tall, like a premium retail catalog product cutout. Photorealistic physical object with restrained three-dimensional depth, real material texture, clean recognizable silhouette, slightly elevated three-quarter camera, orthographic-looking 85mm product photography, soft neutral studio light from upper left. Truly transparent RGBA background with alpha; absolutely no background card, colored square, circle, border, frame, platform, floor or checkerboard. Object centered and fully visible, fills around 82% of square canvas, only a tiny natural contact shadow if needed. Balanced saturation, not cartoon, not clay, not glossy toy, not inflated blob, not a generic 3D app symbol. No text, no logos, no watermark, no labels.
```

### food.webp

```text
Subject: a small ivory porcelain cup filled with cappuccino with simple natural latte-art, with one golden flaky croissant tucked beside the cup. Real ceramic glaze and crisp pastry texture. Warm coffee-and-golden-brown palette.
```

### beauty.webp

```text
Subject: one pale-rose frosted glass skincare serum bottle with an off-white dropper cap, next to one short ivory cosmetic cream tube standing upright. Completely blank containers without any printing. Refined rose, ivory and a subtle natural glass highlight.
```

### sports.webp

```text
Subject: one compact teal rubber-coated dumbbell with a brushed metal handle, photographed diagonally from a slightly elevated angle. Real fitness product, crisp but not glossy.
```

### class.webp

```text
Subject: a small warm wooden painter's palette with five natural daubs of colorful paint and two slender wooden brushes resting diagonally across it. Real worn wood and believable artist materials, very clear silhouette.
```

### popup.webp

```text
Subject: one small upright ivory paper shopping bag with coral-red fabric ribbon handles and a naturally folded open top. Completely blank bag with no logo or writing, subtle real paper fiber.
```

### other.webp

```text
Subject: two small overlapping event admission tickets made from thick cobalt-blue and ivory paper, clean perforated ends and a narrow unprinted stripe. No letters, digits or symbols. Real stationery, not a flat vector drawing.
```

### rating.webp

```text
Subject: one small physical brass five-point star award pin with a restrained golden satin-metal finish, a slightly thick real collectible object with crisp geometry. No stand, no halo or sparkles.
```

### favorites.webp

```text
Subject: one red leather heart-shaped keyring charm attached to a small brushed steel split ring. Real stitched leather detail and restrained metal highlights, not a cartoon heart or glossy inflated shape.
```

### reservations.webp

```text
Subject: one small royal-blue analog alarm clock with two top bells, an ivory face, dark simple hands and thin hour tick marks. No numerals or lettering. Real painted metal, clean compact product silhouette.
```

### messages.webp

```text
Subject: one warm-yellow paper envelope, open just enough to show a small folded ivory letter with no writing. Real folded paper edges and soft natural thickness, not a symbol on a card.
```

### dining-cover.webp

```text
Use case: photorealistic-natural. Asset type: original RESERVE reservation-platform home carousel editorial photograph, landscape 3:2 composition. Natural overhead-to-oblique editorial food photograph of a beautiful plate of fresh handmade tagliatelle with cherry tomatoes and basil in a quiet modern bistro, on a warm dark walnut table. Main plate at the right half of the frame, left half mostly empty darker tabletop usable for HTML white headline overlay. Real imperfect noodle texture, appetizing natural sauce, subtle linen napkin near the upper right, soft warm window light, restrained natural color grading, fine photographic grain. No people, no lettering, no brand marks, no watermark, no fake restaurant signage. This is atmospheric editorial artwork, not a photograph claiming to depict an actual listed merchant. Avoid synthetic 3D look, oversaturation, floating objects, abstract gradients.
```

### class-cover.webp

```text
Use case: photorealistic-natural. Asset type: original RESERVE home carousel editorial photograph, landscape 3:2. Natural editorial still-life photograph inside a small contemporary ceramic workshop. At the right side, a few beautiful handmade ivory and terracotta cups, a wooden clay modeling tool and a small unfinished bowl on a weathered dark work table. Left half is mostly darker open tabletop and softly defocused workshop space for HTML white headline overlay. Warm directional window light, real imperfect ceramic glazes and wood grain, quiet tactile atmosphere, restrained natural colors. No people, no hands, no text, no logos, no watermark. No synthetic 3D aesthetic, no inflated shapes, no neon gradients. Atmospheric category artwork, not a photograph claiming to show a real listed business.
```

### popup-cover.webp

```text
Use case: photorealistic-natural. Asset type: original RESERVE home carousel editorial photograph, landscape 3:2. Candid-feeling architecture photograph of a refined small design pop-up exhibition. On the right, a low terracotta pedestal displaying one sculptural cream ceramic vase and a small cobalt-blue glass object, warm off-white plaster wall and a subtle patch of sunlight. Left half has shadowed dark charcoal wall with quiet negative space usable for HTML white headline overlay. Real plaster texture, believable natural shadows and architectural perspective, understated Korean design-magazine photography. No people, no text, no signage, no logos, no watermark. Avoid stock-photo over-polish, cartoon or synthetic 3D look, floating shapes or gradients. Atmospheric category artwork, not a photograph claiming to show a real merchant.
```
