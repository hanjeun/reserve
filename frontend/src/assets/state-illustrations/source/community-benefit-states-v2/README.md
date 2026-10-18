# RESERVE 신규 커뮤니티·초안·혜택 상태 그림 6종 v2

정지 PNG RGBA8 및 WebP 24개, 각 그림의 편집 가능한 실제 3D Blender 장면 6개와 재생성 코드입니다. 그림에는 mesh/curve geometry만 사용하며 이미지 평면, 외부 모델·텍스처·사진·폰트·링크 라이브러리가 없습니다. 미리보기 시트의 배경과 캡션은 검수용이며 자산에는 포함되지 않습니다.

## 원본 접근 및 기준
이번 작업공간에는 camera-browser-states-v1, policy-menu-icons-v1, edit-controls-v1이 없었습니다. Library가 발급한 정상 다운로드 URL로 각 ZIP을 요청했으나 HTTP 502였고, 같은 정상 경로의 1회 재시도도 각 HTTP 502였습니다. 다운로드 제한을 우회하지 않았으며 이 세 ZIP의 README/장면을 이번 실행에서 열거나 직접 검증했다고 주장하지 않습니다.
대신 기존 로컬 reserve-extra-icons-13 및 reserve-category-kit, reserve-state-kit README를 읽고 실제 waiting-onsite.blend, intake-reservation.blend, popup.blend, empty-notification.blend를 Blender로 열어 설정을 직접 추출했습니다. qa/reference-scene-inspection.json과 로그를 확인하세요. qa/style-settings-comparison.json은 최종 장면의 실제 카메라·조명·색관리·사용 재질을 직접 비교한 결과입니다. 기존 empty-news/notification/QR/payment/quick-messages 이미지도 형태 중복 방지를 위해 비교했습니다. 요청한 최신 세 키트와 직접 일치 검증은 불가한 상태입니다.

## 제작 설정
Blender 4.3.2 / BLENDER_EEVEE_NEXT / 128 samples. 직교 카메라 위치 (3.2,-9,4.8), target (0,0,1.04), ortho scale 3.75. AgX / AgX - Medium High Contrast, exposure 0.35, gamma 1.0. Key 550W/4.5, fill 350W/4, rim 650W/3. 기존 장면과 동일한 오브젝트 자체 음영만 사용하며 바닥/새 그림자 판은 없습니다.
White #F2F5FA, pale #B8C9DE, blue #3182F6, ink #8191A6의 sRGB를 linear로 변환해 재질에 입력. 조명 및 AgX로 인해 렌더 픽셀은 재질 hex와 다릅니다.
512 및 768은 각각 100% native render입니다. PNG는 RGBA8 무손실, WebP는 quality92/method6/alpha_quality100. 두 포맷의 알파 배열을 실제로 비교합니다. WebP 용량 목표는 두 해상도 모두 40KiB (40,960B)이며 개별 실측은 manifest.json 및 qa 검사에 있습니다.

## 재현
작업 폴더에서 다음을 실행하세요 (Blender4.3.2 및 Python/Pillow/numpy 필요).

    blender --factory-startup -b --python source/build_assets.py -- --resolution 512 768
    python source/validate_delivery.py --refresh-derived --refresh-metadata
    blender -b --python source/rerender_saved.py

build_assets.py --names empty-feed 처럼 개별 그림만 재생성할 수 있습니다. 각 .blend는 별도 파일로 열고 F12 렌더할 수 있고 출력은 상대경로입니다. 재현 실행은 이 새 키트의 결과 파일을 갱신하므로 원본 납품 ZIP을 보관하고 복사본에서 실행하세요. 어떠한 기존 RESERVE 키트/앱 코드/사이트/Git/운영 환경도 수정하지 않습니다.

## 형태 의미
- empty-feed: 큰 사진 면이 있는 단일 게시물 카드. 기존 두 장의 소식 문서/벨을 복제하지 않습니다.
- empty-comment: 들여쓴 댓글과 답글, 짧은 thread 연결. 대화함/메시지 봉투와 구분합니다.
- draft-transfer: 두 문서 사이의 단방향 화살표.
- draft-conflict: 두 문서의 서로 다른 항목 및 작은 불일치 비교 표시. 오류 X나 경고색은 없습니다.
- benefit-review-pending: 선물 모티프의 혜택 안내 카드와 돋보기. 결제 시계/완료 체크 없음.
- benefit-review-rejected: 같은 혜택 카드에 되돌림 및 편집 연필. 강한 빨강/실패 연출 없음.

## 검수와 한계
previews의 white/dark 전체 및 실제48/56/64/72/80/96/112px 시트를 100%배율로 보세요. 합성 배경은 #FFFFFF / #161C27입니다. 형태, 잘림, 여백, optical scale, blue accent 유지와 알파를 검토합니다. 작은 그림만으로 정책 의미를 모두 확정할 수 없으므로 앱의 설명 텍스트와 함께 사용하세요.
source/native-render-evidence.jsonl은 실제 native render 기록입니다. qa/saved-scene-roundtrip.json은 저장 후 다시 연 .blend의 양쪽 해상도 재렌더 결과입니다. 로컬 보관한 작업 전 baseline과 납품한 보존 검사 결과는 이 작업공간에서 실제 읽을 수 있었던 기존 파일만 대상으로 합니다. 접근하지 못한 Library ZIP은 전후 해시 보존 검증 대상에 넣지 않았습니다.
실제 앱·브라우저 UI·실기기 검증, 애니메이션, Lottie, 영상, CSS, 배포 검증은 실행하지 않았습니다. 개별 검사의 실제 실행 여부와 수치는 QA 자료가 기준입니다.

## 라이선스·권리·제3자 내역
licenses/assets-cc0.txt와 licenses/code-mit.txt는 접근 가능한 기존 키트의 고지 원문 그대로 복사합니다. 기존 자산/모델 고지는 CC0 1.0, 제작 코드 고지는 MIT입니다. 이번에 새로 작성한 geometry/이미지에는 기여자가 보유하는 권리 범위에서 동일한 CC0 고지를 적용하고 코드에는 MIT를 적용합니다. AI 보조 생성물에 독점권·저작권 성립·제3자 권리 비침해를 보증하지 않습니다. RESERVE 또는 타사의 상표에 대한 권리를 부여하지 않습니다.
외부 콘텐츠(모델·사진·텍스처·폰트)는 자산에 사용하지 않았습니다. 도구는 Blender 및 Python/Pillow/numpy이며 도구 자체는 번들하지 않습니다. 검수 시트 라벨은 Pillow 기본 폰트로 raster화했으며 font 파일은 포함하지 않습니다. 기존 원문 고지 및 재사용 procedural helper의 출처는 reserve-extra-icons-13/source/build_assets.py 및 reserve-category-kit/source/LICENSE-*입니다.

## 파일 무결성
manifest.json은 납품 파일의 바이트 수와 SHA-256을 기록합니다. 자기 참조 해시의 순환을 피하기 위해 manifest.json 자신의 해시는 내부 목록에서 제외합니다. 최종 ZIP의 바이트 수와 SHA-256은 납품 안내에 별도로 기록합니다. 정확한 도구 버전(NumPy 포함)은 qa/tool-versions.json 및 manifest.json의 production_tools를 확인하세요.

## v2 검수 이력 (2026-10-15 UTC)
v1의 최종 24개 이미지, 6개 .blend 및 라이선스 원문은 바이트 그대로 재사용합니다. 이번 v2에서는 72px 시트를 추가하고 64/72/80/96/112px를 포함한 밝은/어두운 배경 시트를 다시 검토하며, 40KiB 목표·알파·치수·바이트·해시·기존 파일 보존을 다시 검사합니다. 512/768 독립 렌더 및 저장된 장면 재열기 12회는 같은 날 제작된 v1 실행 로그와 결과를 승계합니다. v2에서는 Blender를 새로 실행했다고 주장하지 않으며, 승계한 재렌더 PNG와 현재 PNG의 픽셀 일치 여부를 다시 검사합니다. 원본 최신 세 키트의 접근 불가 기록도 v1 당시 결과로, 이번에 새 다운로드를 시도한 결과가 아닙니다. v2 전체 비교 시트는 실제 납품 WebP를 디코딩하여 생성하며 PNG와의 알파/치수 검증은 별도로 수행합니다.
