# 홈 이미지 자산

홈의 분야 아이콘·사진 배너 자산의 출처와 사용 규칙, 홈 화면 구성을 정리해요.

## 출처와 사용 규칙

- 모든 이미지는 내장 이미지 생성 도구(built-in mode)로 RESERVE 전용으로 만든 오리지널이에요. 분야·바로가기 아이콘 10개, 모바일 사진 3개, PC 가로 사진 3개, 운영 안내용 모바일·PC 사진 2개예요.
- 사진 배너는 서비스 분야 탐색용 분위기 이미지예요. 실제 입점 가게·판매 상품·이벤트 사진이라고 주장하지 않아요.
- 이미지 파일에 글자를 넣지 않아요.
- 레이아웃은 [캐치테이블](https://app.catchtable.co.kr/)과 [KREAM](https://kream.co.kr/)의 공개 화면을 참고했어요. 타사 이미지·로고·CSS 파일은 프로젝트에 복사하지 않아요.

## 자산

배포 위치는 `frontend/public/images/discovery-v3/`이고, WebP만 배포해요.

- 아이콘 10개는 투명 배경의 입체 물체 컷아웃이에요. 배경 카드·테두리·원형 판을 쓰지 않아요.
- 분야 아이콘 크기는 `constants/discovery.js`의 `SERVICE_DOMAIN_IMAGES`, 홈 바로가기는 `Home/index.jsx`의 `SHORTCUTS`에서 관리해요.
- PC 배너는 모바일 사진을 편집 참조로 같은 분위기의 가로 구도로 만든 뒤 Sharp로 1600×640 WebP로 변환했어요.

| 자산 | 크기 | 용도 |
|---|---:|---|
| `dining-cover-desktop-v1.webp` | 1600×640 | PC 배너 |
| `class-cover-desktop-v1.webp` | 1600×640 | PC 배너 |
| `popup-cover-desktop-v1.webp` | 1600×640 | PC 배너 |
| `operation-guide-cover-v1.webp` | 1536×1024 | 운영 안내, 900px 미만 3:2 |
| `operation-guide-cover-desktop-v1.webp` | 1983×793 | 운영 안내, 900px 이상 2.5:1 |

## 홈 구성

공통 헤더 → 탐색 탭 → 전체 지역 → 사진 캐러셀 → 분야/바로가기 → 운영 안내 링크 → 추천 가게 순서예요.

- 탐색 탭은 `홈 · 탐색 · 혜택 · 웨이팅 · 피드`이고 `DiscoveryNav`를 써요.
- 캐러셀은 직접 넘기기/스와이프로 움직이고, 모션 감소 설정에서는 즉시 이동해요.
- 바로가기 목적지는 `/stores?domain=…`, 평점순 탐색, 관심 가게, 내 예약, 메시지예요.
- 운영 안내는 `/operation-guide`로 가는 사진 링크이고, 제목·설명은 HTML로 겹쳐요.
- 추천 가게는 행 목록(왼쪽 사진, 오른쪽 이름·소개·평점·주소)으로 실제 입점 가게만 보여 줘요.
- 헤더·검색 화면 규칙은 [search-ui.md](search-ui.md)를 참고하세요.

| 폭 | 구성 |
|---|---|
| 모바일(768px 미만) | 64px 헤더, 44px 탐색 탭, 5열/2행 바로가기, 1열 추천 목록, 3:2 배너 |
| 태블릿(768–899px) | 64px 헤더, 44px 탐색 탭, 좌우 24px 여백, 80px 썸네일, 3:2 배너 |
| PC(900px 이상) | 1600×640 배너를 2.5:1로 한 장씩(최대 1200×480px), ‘서비스별로 찾기’ 6개 + ‘빠른 메뉴’ 4개, 추천 2열 |

`Home/index.jsx`의 `picture`가 900px 이상에서 PC 자산을, 그 밖에서는 모바일 자산을 골라요.

## 배너 프롬프트

실제 사용한 생성 프롬프트예요.

### operation-guide-cover-v1.webp — 모바일

```text
Photorealistic editorial photograph for a Korean reservation service operation guide, portrait-friendly 3:2 landscape composition. A warmly sunlit independent Korean service shop before opening: a small handwritten planning notebook, pencil, ceramic cup, clipped appointment card without readable text, linen curtain, real wood counter, healthy plant, and soft afternoon light. One calm, lived-in scene with no staged people. Center the most recognisable materials for a narrow mobile crop; leave gentle natural negative space but not a blank abstract field. Tactile authentic Korean lifestyle magazine photography, warm neutral cream and walnut palette, restrained contrast, believable shadows and materials. No text, logo, watermark, readable writing, phone screen, brand packaging, UI, artificial 3D render, glossy stock photo appearance, or surreal objects. Output only the photograph.
```

### operation-guide-cover-desktop-v1.webp — PC

```text
Photorealistic editorial website hero photograph, wide 2.5:1 composition, for a Korean reservation service operation guide. A warmly sunlit independent Korean service shop just before opening: a real wood counter, small paper appointment notebook, pencil, ceramic cup, plant, linen curtain and a subtle glimpse of a neatly prepared service space. Put the visual subject and warm materials toward the right half; reserve quiet, darker but still natural room on the left for a small HTML label. Candid Korean lifestyle magazine photography: honest imperfections, muted cream and walnut tones, natural daylight, tactile wood and paper, restrained contrast. No people, no logos, no readable text, no brand labels, no watermarks, no phone screen, no UI, no artificial 3D render, no glossy stock photo look, no surreal objects. Output only the photograph.
```

### dining-cover-desktop-v1.webp

참조: `frontend/public/images/discovery-v3/dining-cover.webp` (기존 RESERVE 모바일 사진).

```text
Use case: precise-object-edit; photorealistic-natural editorial website banner.
Input Image 1: existing RESERVE mobile dining photograph, the edit target and lighting/material reference.
Primary request: create its DESKTOP wide sibling by expanding and recomposing the same photograph into a 2.5:1 landscape image, approximately 1600x640. Preserve the original natural pasta, cherry tomato and basil dish, cream ceramic plate, dark walnut tabletop, linen and warm window light. The entire plate must be visible on the RIGHT 45% of the canvas with comfortable right and top/bottom margins, not enormous or cropped. The LEFT 45% is dark, open walnut tabletop for HTML white headline overlay, with believable grain and minimal clutter. Keep the original oblique overhead camera angle and restrained realistic photographic texture. Change only the framing/extended background needed for this wider desktop composition. No people, no extra dishes, no lettering, no logo, no watermark, no UI, no fake restaurant signage. Do not stretch the original objects. No synthetic 3D or glossy AI look. Output only the wide photograph, not a website mockup.
```

### class-cover-desktop-v1.webp

참조: `frontend/public/images/discovery-v3/class-cover.webp` (기존 RESERVE 모바일 사진).

```text
Use case: precise-object-edit; photorealistic-natural editorial website banner.
Input Image 1: existing RESERVE mobile ceramic workshop photograph, the edit target and lighting/material reference.
Primary request: create its DESKTOP wide sibling by expanding and recomposing the same scene into a 2.5:1 landscape image, approximately 1600x640. Preserve the handmade speckled ivory ceramic cup, terracotta cups, small unfinished bowl, clay modeling tools, weathered dark wooden workbench, softly defocused workshop and warm window light. Main still-life objects sit on the RIGHT 45% with intact silhouettes, not oversized, no edge clipping. The LEFT 45% remains quiet darker open workbench and defocused workshop for HTML white headline overlay. Keep the camera angle, tactile imperfect glaze, realistic wood grain and restrained natural color grading. Change only framing/extended background required for desktop. No people, no hands, no extra decorative objects, no lettering, no logos, no watermark, no UI. Do not stretch or distort objects. Avoid synthetic 3D or glossy AI polish. Output only the wide photograph, not a website mockup.
```

### popup-cover-desktop-v1.webp

참조: `frontend/public/images/discovery-v3/popup-cover.webp` (기존 RESERVE 모바일 사진).

```text
Use case: precise-object-edit; photorealistic-natural editorial website banner.
Input Image 1: existing RESERVE mobile pop-up gallery photograph, the edit target and lighting/material reference.
Primary request: create its DESKTOP wide sibling by expanding and recomposing the same gallery into a 2.5:1 landscape image, approximately 1600x640. Preserve the warm off-white textured plaster wall, low terracotta pedestal, sculptural cream ceramic vase, small cobalt-blue glass object, charcoal shadowed gallery wall, natural sunlight and architecture. Pedestal and BOTH displayed objects are intact on the RIGHT 45% with comfortable margins, never enormous or cut off. The LEFT 45% is quiet darker charcoal gallery space for HTML white headline overlay. Keep the original architectural perspective, real plaster grain and believable natural shadows. Change only framing/extended architecture required for desktop. No people, no extra exhibits, no text, no signage, no logos, no watermark, no UI. Do not stretch the architecture or objects. No synthetic 3D or AI-looking gradients. Output only the wide photograph, not a website mockup.
```

## 아이콘·모바일 사진 프롬프트

아이콘은 공통 프롬프트 뒤에 항목별 ` Subject:` 문장을 이어 붙여 만들었어요. 아이콘과 모바일 사진 3개는 참조 이미지 없이 생성했어요.

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
