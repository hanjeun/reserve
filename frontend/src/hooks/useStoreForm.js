import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { storeService } from '../services';
import useMessage from './useMessage';
import { buildStoreFormData } from '../utils/form';
import { handleApiError } from '../utils/errorHandler';
import { getDetailImageUrl } from '../utils/image';
import { storeKeys } from './queryKeys';
import dayjs from 'dayjs';

/** StoreRegister, StoreEdit에서 공유하는 폼 공통 로직 */
export const useStoreForm = ({
    mode = 'create',
    initialData = null,
    storeId = null,
}) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = useMessage();
    const [loading, setLoading] = useState(false);
    const [mainImage, setMainImage] = useState([]);
    const [detailImages, setDetailImages] = useState([]);

    // 수정 모드: 기존 이미지를 Upload fileList 형식으로 변환
    useEffect(() => {
        if (mode !== 'edit' || !initialData) return;

        if (initialData.mainImageUrl) {
            setMainImage([{
                uid: '-1',
                name: 'main-image',
                status: 'done',
                url: getDetailImageUrl(initialData.mainImageUrl),
                existingUrl: initialData.mainImageUrl,
            }]);
        }

        if (initialData.detailImageUrls?.length > 0) {
            setDetailImages(initialData.detailImageUrls.map((url, i) => ({
                uid: `-detail-${i}`,
                name: `detail-image-${i}`,
                status: 'done',
                url: getDetailImageUrl(url),
                existingUrl: url,
            })));
        }
    }, [mode, initialData]);

    const handleMainImageChange    = ({ fileList }) => setMainImage(fileList.slice(-1));
    const handleDetailImagesChange = ({ fileList }) => setDetailImages(fileList.slice(0, 5));

    const appendImages = (formData) => {
        if (mode === 'create') {
            if (mainImage[0]?.originFileObj) formData.append('mainImage', mainImage[0].originFileObj);
            detailImages.forEach(f => { if (f.originFileObj) formData.append('detailImages', f.originFileObj); });
        } else {
            // existingUrl = 유지, originFileObj = 신규 업로드
            if (mainImage[0]?.existingUrl)       formData.append('existingMainImageUrl', mainImage[0].existingUrl);
            else if (mainImage[0]?.originFileObj) formData.append('mainImage', mainImage[0].originFileObj);

            const existingUrls = [];
            detailImages.forEach(f => {
                if (f.existingUrl)        existingUrls.push(f.existingUrl);
                else if (f.originFileObj) formData.append('detailImages', f.originFileObj);
            });
            existingUrls.forEach(url => formData.append('existingDetailImageUrls', url));
        }
    };

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const formData = buildStoreFormData(values);
            appendImages(formData);

            mode === 'create'
                ? await storeService.createStore(formData)
                : await storeService.updateStore(storeId, formData);

            // 내 가게 목록 + 공개 가게 목록 캐시 무효화 (storeKeys.all = ['stores'] prefix 전체)
            await queryClient.invalidateQueries({ queryKey: storeKeys.all() });

            message.success(mode === 'create' ? '가게가 등록되었습니다' : '가게 정보가 수정되었습니다');
            navigate('/my-stores');
        } catch (err) {
            handleApiError(err, message, mode === 'create' ? '가게 등록에 실패했습니다' : '가게 수정에 실패했습니다');
        } finally {
            setLoading(false);
        }
    };

    const getInitialValues = () => {
        if (mode === 'create' || !initialData) return {};
        return {
            name:         initialData.name,
            category:     initialData.category,
            address:      initialData.address,
            zipCode:      initialData.zipCode      ?? '',
            addressDetail: initialData.addressDetail ?? '',
            latitude:     initialData.latitude      ?? undefined,
            longitude:    initialData.longitude     ?? undefined,
            phone:        initialData.phone,
            description:  initialData.description,
            noShowDeposit: initialData.noShowDeposit,
            maxCapacityPerSlot:        initialData.maxCapacityPerSlot        ?? undefined,
            autoApprovalEnabled:       initialData.autoApprovalEnabled       ?? false,
            allowLatePayment:          initialData.allowLatePayment          ?? false,
            allowDuplicateReservation: initialData.allowDuplicateReservation ?? false,
            emailNotificationEnabled:  initialData.emailNotificationEnabled  ?? true,
            fullRefundDays:            initialData.fullRefundDays            ?? 3,
            partialRefundDays:         initialData.partialRefundDays         ?? 1,
            partialRefundRate:         initialData.partialRefundRate         ?? 50,
            bookingDeadlineHours:      initialData.bookingDeadlineHours      ?? undefined,
            paymentTimeoutMinutes:     initialData.paymentTimeoutMinutes     ?? 30,
            reservationSlotMinutes:    initialData.reservationSlotMinutes    ?? 30,
            nearbyRadiusKm:            initialData.nearbyRadiusKm            ?? 3,
            // 휴무·예약범위 (2026-08-11). 서버가 항상 배열을 내려주지만, 옛 응답이 캐시에 남아
            // 있을 수 있어 ?? [] 로 받는다 — undefined 면 Checkbox.Group 이 uncontrolled 로 떨어진다.
            closedDays:                initialData.closedDays                ?? [],
            closedDates:               (initialData.closedDates ?? []).map(d => dayjs(d)),
            maxAdvanceBookingDays:     initialData.maxAdvanceBookingDays     ?? undefined,
            times: initialData.openTime && initialData.closeTime
                ? [dayjs(initialData.openTime, 'HH:mm'), dayjs(initialData.closeTime, 'HH:mm')]
                : null,
            breakTimes: initialData.breakStartTime && initialData.breakEndTime
                ? [dayjs(initialData.breakStartTime, 'HH:mm'), dayjs(initialData.breakEndTime, 'HH:mm')]
                : null,
        };
    };

    return {
        loading,
        mainImage,
        detailImages,
        handleSubmit,
        handleMainImageChange,
        handleDetailImagesChange,
        getInitialValues,
    };
};
