package kr.it.reserve.store.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.store.dto.StoreCreateRequest;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.entity.Store;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;

/** 사진 순서·업로드·정리는 호출 서비스의 트랜잭션 안에서 처리한다. */
@Slf4j(topic = "kr.it.reserve.store.service.StoreService")
final class StoreImages {
    private final FileStorageService fileStorageService;
    private final FileDeletionOutboxService fileDeletionOutboxService;
    private final ObjectMapper objectMapper;
    private final Executor imageUploadExecutor;

    StoreImages(FileStorageService storage, FileDeletionOutboxService deletion, ObjectMapper mapper, Executor executor) {
        fileStorageService = storage;
        fileDeletionOutboxService = deletion;
        objectMapper = mapper;
        imageUploadExecutor = executor;
    }

    void create(Store savedStore, StoreCreateRequest request, Long memberId) {
        Long storeId = savedStore.getId();
        // 2단계: storeId 확보 후 이미지 업로드 → getPublicUrl로 CloudFront URL 변환
        if (request.getMainImage() != null && !request.getMainImage().isEmpty()) {
            String key = fileStorageService.storeFile(
                    request.getMainImage(), FileStoragePaths.storeThumbnail(memberId, storeId));
            savedStore.setMainImageUrl(fileStorageService.getPublicUrl(key));
            int[] dim = fileStorageService.readImageDimensions(request.getMainImage());
            if (dim != null) {
                savedStore.setMainImageWidth(dim[0]);
                savedStore.setMainImageHeight(dim[1]);
            }
        }

        List<String> detailImageUrls = new ArrayList<>();
        List<ImageDimension> detailImageDims = new ArrayList<>();
        if (request.getDetailImages() != null && !request.getDetailImages().isEmpty()) {
            for (UploadedDetailImage r : uploadDetailImagesParallel(request.getDetailImages(), memberId, storeId)) {
                detailImageUrls.add(r.url());
                detailImageDims.add(r.dim());
            }
        }

        if (!detailImageUrls.isEmpty()) {
            savedStore.setDetailImageList(detailImageUrls);
            savedStore.setDetailImagesMeta(toDetailImagesMetaJson(detailImageDims));
        }

    }

    private record ImageDimension(Integer width, Integer height) {}

    private List<ImageDimension> parseDetailImagesMeta(String json) {
        if (json == null || json.trim().isEmpty()) return new ArrayList<>();
        try {
            return objectMapper.readValue(json, new TypeReference<List<ImageDimension>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse detailImagesMeta, treating as empty: errorType={}",
                    e.getClass().getSimpleName());
            return new ArrayList<>();
        }
    }

    private String toDetailImagesMetaJson(List<ImageDimension> list) {
        try {
            return objectMapper.writeValueAsString(list);
        } catch (Exception e) {
            log.warn("Failed to serialize detailImagesMeta: errorType={}", e.getClass().getSimpleName());
            return null;
        }
    }

    private ImageDimension readImageDimension(MultipartFile file) {
        int[] dim = fileStorageService.readImageDimensions(file);
        return dim != null ? new ImageDimension(dim[0], dim[1]) : new ImageDimension(null, null);
    }

    // 상세 이미지 하나 업로드 결과(key + URL + 원본 크기) — key는 바깥 트랜잭션의 rollback cleanup 등록용
    private record UploadedDetailImage(String key, String url, ImageDimension dim) {}

    /** 입력 순서로 병렬 업로드 결과를 모아 이미지와 메타데이터 순서를 맞춘다. 실패 예외는 호출 트랜잭션으로 전파한다. */
    private List<UploadedDetailImage> uploadDetailImagesParallel(List<MultipartFile> files, Long memberId, Long storeId) {
        List<CompletableFuture<UploadedDetailImage>> futures = files.stream()
                .filter(f -> f != null && !f.isEmpty())
                .map(f -> CompletableFuture.supplyAsync(() -> {
                    String key = fileStorageService.storeFile(f, FileStoragePaths.storeImage(memberId, storeId));
                    String url = fileStorageService.getPublicUrl(key);
                    return new UploadedDetailImage(key, url, readImageDimension(f));
                }, imageUploadExecutor))
                .toList();
        try {
            CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
            List<UploadedDetailImage> results = futures.stream().map(CompletableFuture::join).toList();
            // worker 스레드에는 Spring 트랜잭션 문맥이 없으므로 join 뒤 바깥 트랜잭션에 등록한다.
            results.forEach(result -> fileStorageService.registerRollbackCleanup(result.key()));
            return results;
        } catch (CompletionException e) {
            // allOf가 끝난 시점에는 모든 업로드가 끝났으므로, 부분 성공한 객체도 즉시 정리한다.
            futures.stream()
                    .filter(future -> !future.isCompletedExceptionally() && !future.isCancelled())
                    .map(CompletableFuture::join)
                    .forEach(result -> fileStorageService.deleteFile(result.key()));
            if (e.getCause() instanceof RuntimeException re) throw re;
            throw e;
        }
    }

    void updateStoreImages(Store store, StoreUpdateRequest request) {
        Long memberId = store.getOwner().getId();
        Long storeId = store.getId();
        String mainImagePrefix = FileStoragePaths.storeThumbnail(memberId, storeId);
        String detailImagePrefix = FileStoragePaths.storeImage(memberId, storeId);

        // 새 파일을 S3에 올리기 전에 기존 URL 참조를 전부 검증한다. 검증을 뒤로 미루면
        // 잘못된 요청을 409로 거절하면서도 S3에는 새 객체가 남는 부분 성공이 생긴다.
        validateExistingStoreImageReferences(store, request);
        // 순서 정보도 업로드 전에 푼다 — 잘못된 순서를 거절하면서 새 파일만 S3 에 남기지 않게.
        List<DetailImageSlot> detailOrder = resolveDetailImageOrder(request);

        updateMainImage(store, request, mainImagePrefix);

        // 상세 이미지: 이전 URL → 이전 크기 매핑을 미리 구성해둔다(순서가 바뀌어도 URL 기준으로 찾음)
        List<String> oldUrls = store.getDetailImageList();
        List<ImageDimension> oldDims = parseDetailImagesMeta(store.getDetailImagesMeta());
        Map<String, ImageDimension> urlToDim = new HashMap<>();
        for (int i = 0; i < oldUrls.size() && i < oldDims.size(); i++) {
            urlToDim.put(oldUrls.get(i), oldDims.get(i));
        }

        List<String> keptUrls = request.getExistingDetailImageUrls() != null
                ? request.getExistingDetailImageUrls() : List.of();
        List<UploadedDetailImage> uploaded = request.getDetailImages() != null
                ? uploadDetailImagesParallel(request.getDetailImages(), memberId, storeId) : List.of();

        List<String> finalDetailImages = new ArrayList<>();
        List<ImageDimension> finalDetailDims = new ArrayList<>();
        appendDetailImagesInOrder(detailOrder, keptUrls, uploaded, urlToDim, finalDetailImages, finalDetailDims);

        // 삭제된 파일 처리
        List<String> currentDetailImages = store.getDetailImageList();
        if (currentDetailImages != null) {
            for (String existingUrl : currentDetailImages) {
                if (!finalDetailImages.contains(existingUrl)) {
                    enqueueManagedFileDeletion(
                            existingUrl, detailImagePrefix, "STORE_DETAIL_IMAGE", storeId);
                }
            }
        }
        store.setDetailImageList(finalDetailImages);
        store.setDetailImagesMeta(toDetailImagesMetaJson(finalDetailDims));
    }

    private void updateMainImage(Store store, StoreUpdateRequest request, String mainImagePrefix) {
        if (request.getMainImage() != null && !request.getMainImage().isEmpty()) {
            String oldMainImage = store.getMainImageUrl();
            String key = fileStorageService.storeFile(
                    request.getMainImage(), mainImagePrefix);
            store.setMainImageUrl(fileStorageService.getPublicUrl(key));
            int[] dim = fileStorageService.readImageDimensions(request.getMainImage());
            store.setMainImageWidth(dim != null ? dim[0] : null);
            store.setMainImageHeight(dim != null ? dim[1] : null);
            enqueueManagedFileDeletion(
                    oldMainImage, mainImagePrefix, "STORE_MAIN_IMAGE", store.getId());
        } else if (request.getExistingMainImageUrl() != null) {
            store.setMainImageUrl(request.getExistingMainImageUrl());
            // 기존 이미지를 그대로 유지하는 경우에는 width/height도 이미 저장된 값 그대로 유지된다(건드리지 않음)
        }
    }

    private void appendDetailImagesInOrder(
            List<DetailImageSlot> detailOrder,
            List<String> keptUrls,
            List<UploadedDetailImage> uploaded,
            Map<String, ImageDimension> urlToDim,
            List<String> finalDetailImages,
            List<ImageDimension> finalDetailDims) {
        if (detailOrder.isEmpty()) {
            // 순서 정보가 없는 예전 클라이언트: 기존 이미지 → 새 이미지
            for (String url : keptUrls) {
                finalDetailImages.add(url);
                finalDetailDims.add(urlToDim.getOrDefault(url, new ImageDimension(null, null)));
            }
            for (UploadedDetailImage r : uploaded) {
                finalDetailImages.add(r.url());
                finalDetailDims.add(r.dim());
            }
        } else {
            for (DetailImageSlot slot : detailOrder) {
                if (slot.existing()) {
                    String url = keptUrls.get(slot.index());
                    finalDetailImages.add(url);
                    finalDetailDims.add(urlToDim.getOrDefault(url, new ImageDimension(null, null)));
                } else {
                    UploadedDetailImage r = uploaded.get(slot.index());
                    finalDetailImages.add(r.url());
                    finalDetailDims.add(r.dim());
                }
            }
        }
    }

    /** 기존 URL은 이 가게의 같은 역할에 저장된 값만 유지한다. 삭제할 때는 관리 경로의 소유권을 별도로 확인해 다른 자원의 파일을 지우지 않는다. */
    private void validateExistingStoreImageReferences(Store store, StoreUpdateRequest request) {
        String requestedMain = request.getExistingMainImageUrl();
        if (requestedMain != null
                && (requestedMain.isBlank() || !requestedMain.equals(store.getMainImageUrl()))) {
            throw staleStoreImageReference();
        }

        List<String> requestedDetails = request.getExistingDetailImageUrls();
        if (requestedDetails == null) return;

        Set<String> currentDetails = new HashSet<>(store.getDetailImageList());
        Set<String> uniqueRequestedDetails = new HashSet<>();
        for (String requestedDetail : requestedDetails) {
            if (requestedDetail == null
                    || requestedDetail.isBlank()
                    || !currentDetails.contains(requestedDetail)
                    || !uniqueRequestedDetails.add(requestedDetail)) {
                throw staleStoreImageReference();
            }
        }
    }

    /** 상세 이미지 한 칸 — 기존 이미지(existingDetailImageUrls)의 i번째인지, 새 파일(detailImages)의 j번째인지. */
    private record DetailImageSlot(boolean existing, int index) {}

    /**
     * {@code detailImageOrder} 를 칸 목록으로 푼다. 빈 목록이면 기존 → 새 순서를 그대로 쓴다.
     *
     * <p>기존 개수 + 새 개수와 길이가 같고, 모든 항목이 범위 안이며 중복이 없어야 한다 = 정확히 한 번씩 쓰는 순열.
     * 하나라도 어긋나면 사진이 빠지거나 두 번 들어가므로 저장하지 않고 거절한다.
     */
    private List<DetailImageSlot> resolveDetailImageOrder(StoreUpdateRequest request) {
        List<String> order = request.getDetailImageOrder();
        if (order == null || order.isEmpty()) return List.of();

        int existingCount = request.getExistingDetailImageUrls() != null ? request.getExistingDetailImageUrls().size() : 0;
        int newCount = request.getDetailImages() == null ? 0
                : (int) request.getDetailImages().stream().filter(f -> f != null && !f.isEmpty()).count();
        if (order.size() != existingCount + newCount) throw invalidDetailImageOrder();

        Set<String> seen = new HashSet<>();
        List<DetailImageSlot> slots = new ArrayList<>();
        for (String token : order) {
            if (token == null || !token.matches("[en]\\d{1,2}") || !seen.add(token)) throw invalidDetailImageOrder();
            boolean existing = token.charAt(0) == 'e';
            int index = Integer.parseInt(token.substring(1));
            if (index >= (existing ? existingCount : newCount)) throw invalidDetailImageOrder();
            slots.add(new DetailImageSlot(existing, index));
        }
        return slots;
    }

    private StoreException invalidDetailImageOrder() {
        return new StoreException(
                "상세 이미지 순서 정보가 올바르지 않아요. 새로고침한 뒤 다시 시도해주세요.",
                HttpStatus.BAD_REQUEST);
    }

    private StoreException staleStoreImageReference() {
        return new StoreException(
                "가게 이미지가 다른 곳에서 변경됐어요. 새로고침한 뒤 다시 시도해주세요.",
                HttpStatus.CONFLICT);
    }

    /** 검증되지 않은 DB URL이 있어도 다른 리소스의 S3 객체를 삭제하지 않는다. */
    void enqueueManagedFileDeletion(
            String target,
            String expectedPrefix,
            String sourceType,
            Long sourceId) {
        if (target == null || target.isBlank()) return;
        if (expectedPrefix == null
                || !fileStorageService.isManagedFileUnderPrefix(target, expectedPrefix)) {
            log.warn("Skipped file deletion outside resource boundary: sourceType={}, sourceId={}",
                    sourceType, sourceId);
            return;
        }
        fileDeletionOutboxService.enqueue(target, sourceType, sourceId);
    }

}
