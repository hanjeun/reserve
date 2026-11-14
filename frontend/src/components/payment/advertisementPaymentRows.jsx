import dayjs from 'dayjs';
import CopyableText from '../common/CopyableText';
import { CalendarOutlined, DollarOutlined, FileTextOutlined, NotificationOutlined, ShopOutlined, UserOutlined } from '../common/icons';
import { AD_TYPE_LABELS } from '../../constants/advertisement';
import { formatCurrency } from '../../utils/common';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const formatDay = value => {
    const day = dayjs(value);
    return day.isValid() ? `${day.month() + 1}월 ${day.date()}일 (${WEEKDAYS[day.day()]})` : value;
};

export default function advertisementPaymentRows({ storeName, productName, merchantUid, adType, startDate, endDate, dailyPrice, exposureDays, buyerName }) {
    const firstDay = startDate && formatDay(startDate);
    const period = firstDay && endDate && startDate !== endDate ? `${firstDay} ~ ${formatDay(endDate)}` : firstDay;
    return [
        { Icon: ShopOutlined, label: storeName ? '가게' : '상품', value: storeName || productName },
        { Icon: FileTextOutlined, label: '주문번호', value: merchantUid && <CopyableText value={merchantUid} label="주문번호" wrap /> },
        { Icon: NotificationOutlined, label: '광고 유형', value: AD_TYPE_LABELS[adType] },
        { Icon: CalendarOutlined, label: '노출 기간', value: period },
        { Icon: DollarOutlined, label: '요금', value: dailyPrice != null && exposureDays > 0 ? `하루 ${formatCurrency(dailyPrice)} × ${exposureDays}일` : null },
        { Icon: UserOutlined, label: '결제자', value: buyerName },
    ].filter(row => row.value);
}
