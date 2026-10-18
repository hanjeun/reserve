import { useState } from 'react';
import { Typography, Form, Input } from 'antd';
import { Button } from '../../components/common';
import AddressSearch from '../../components/store/StoreForm/AddressSearch';
import { useMessage } from '../../hooks';
import { memberService } from '../../services';
import { handleApiError } from '../../utils/errorHandler';
import { VALIDATION_RULES } from '../../utils/validation';
import { SCROLL_TO_FIRST_ERROR } from '../../utils/form';
import useAuthStore from '../../store/useAuthStore';
import { colors, fontSize } from '../../styles/tokens';

import styles from './myPageStyles';

const { Text } = Typography;
const LocationTab = ({ user }) => {
    const { message } = useMessage();
    const [form] = Form.useForm();
    // 우편번호·상세주소는 폼의 현재 값을 넘긴다(가게 폼과 같은 방식). 저장된 회원 값을 넘기면 주소를 다시 골라도
    // AddressSearch 의 동기화가 옛 우편번호·상세주소로 되돌린다(2026-09-24).
    const watchedZipCode = Form.useWatch('zipCode', form);
    const watchedAddressDetail = Form.useWatch('addressDetail', form);

    const hasSaved = user?.latitude != null && user?.longitude != null;

    // 좌표(latitude/longitude)는 AddressSearch의 onMeta 콜백으로만 들어오는 값이라 일반 폼 필드로 다루기
    // 애매해서(사용자가 직접 입력하는 값이 아니라 검색 결과 선택 시에만 바뀜) 별도 state로 관리한다.
    const [coords, setCoords] = useState(
        hasSaved ? { latitude: user.latitude, longitude: user.longitude } : null
    );
    const [loading, setLoading] = useState(false);

    // 주소 컬럼이 생기기 전에 위치를 등록한 기존 회원은 좌표만 있고 주소는 null이다.
    // "위치는 등록되어 있지만 그게 어떤 주소인지는 보여줄 수 없는" 상태임을 안내문으로 따로 알린다.
    const savedWithoutAddress = hasSaved && !user?.locationAddress;

    // 2026-07 추가 — 주소를 새로 채우고 나서 address/addressDetail만 지우면 zipCode만 남는
    // 버그를 막기 위해 버튼을 임의로 disable하는 대신 disabled={!coords}만 검사하고 address/detail이
    // 비어있어도 무시하고 있었는데, StoreBasicInfo(가게 주소)와 동일한 컨벤션으로 바꿔서 프로젝트에서
    // 필수 텍스트 필드는 Form.Item + VALIDATION_RULES로 검증하고 미입력이면 버튼은 그대로 눌리게 하되
    // 빨간 테두리 + 메시지가 뜨는 식 — 즉 NameTab/PasswordTab/StoreBasicInfo와 동일한 패턴으로 통일.
    // coords는 Form 필드가 아니라 onMeta로만 들어오는 별도 값이라 rules로는 검증 못해서, Form 검증이 통과된
    // 다음(onFinish 안)에 추가로 확인한다.
    const onFinish = async (values) => {
        // coords 는 Form 필드가 아니라 AddressSearch 의 onMeta 로만 들어오는 값이라 rules 로 못 잡는다.
        // 그래도 사용자가 볼 때는 "주소 칸의 문제"이므로, 토스트 대신 setFields 로 그 칸에 붙인다.
        if (!coords) {
            form.setFields([{ name: 'address', errors: ['검색 결과에서 주소를 선택해주세요'] }]);
            return;
        }
        setLoading(true);
        try {
            await memberService.updateLocation({
                latitude: coords.latitude,
                longitude: coords.longitude,
                address: values.address,
                zipCode: values.zipCode,
                addressDetail: values.addressDetail,
            });
            await useAuthStore.getState().checkAuth(true);
            message.success('위치가 등록됐어요');
        } catch (err) {
            handleApiError(err, message, '위치 등록에 실패했어요');
        } finally {
            setLoading(false);
        }
    };

    let noticeText;
    if (user?.locationAddress) {
        const full = [user.locationAddress, user.locationAddressDetail].filter(Boolean).join(' ');
        noticeText = `등록된 위치: ${full} — 거리순 가게 목록에서 위치 권한을 허용하지 않았을 때 이 주소가 기준이 돼요. 바꾸려면 아래에서 다시 검색하세요.`;
    } else if (savedWithoutAddress) {
        noticeText = '등록된 위치가 있어요. 다만 주소가 함께 저장되기 전에 등록된 거라 어떤 주소인지 표시할 수가 없어요. 아래에서 다시 검색해 저장하면 주소까지 함께 기록돼요.';
    } else {
        noticeText = '위치 권한을 허용하지 않았다면, 여기에 주소를 등록해두면 그 주소 기준으로 거리순 정렬을 이용할 수 있어요.';
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* securityNotice는 PasswordTab과 공유하는데 marginBottom:16이 들어있다. 여기는
                외부 컨테이너가 flex+gap:12로 이미 간격을 만들므로, 안내박스의 marginBottom까지
                더해지면 이 줄 아래만 28px로 과도하게 벌어져 위아래 간격이 어깧난다 — 0으로 상쇄. */}
            <div style={{ ...styles.securityNotice, marginBottom: 0 }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>
                    {noticeText}
                </Text>
            </div>
            <Form
                form={form}
                onFinish={onFinish}
                layout="vertical"
                requiredMark={false}
                scrollToFirstError={SCROLL_TO_FIRST_ERROR}
                initialValues={{
                    address: user?.locationAddress || '',
                    zipCode: user?.locationZipCode || '',
                    addressDetail: user?.locationAddressDetail || '',
                }}
            >
                {/* AddressSearch가 도로명·우편번호·상세주소를 한 세트로 다룬다. Form.Item(name="address")이
                    value/onChange를 자동으로 주입해줌(StoreBasicInfo와 동일한 방식). 가게 등록 폼과 동일하게
                    주소 필드만 rules로 검증한다 — 상세주소는 실제로 선택적인 주소가 많아(단독주택 등)
                    필수로 강제하지 않는다. */}
                <Form.Item name="address" rules={VALIDATION_RULES.address} style={{ marginBottom: 12 }}>
                    <AddressSearch
                        zipCode={watchedZipCode ?? ''}
                        addressDetail={watchedAddressDetail ?? ''}
                        onMeta={(meta) => {
                            // 2026-07 추가 — 좀 있으면 setCoords를 건너뛰고 이전 좌표가 그대로 남았다.
                            // AddressSearch가 주소를 고치려고 재포커스할 때 onMeta({ latitude: null, ... })를
                            // 보내는데, 여기서 null을 무시하면 새 주소를 타이핑만 하고 드롭다운에서
                            // 다시 선택하지 않은 채 저장하면 이전 주소의 좌표가 새 주소에 붙어버린다.
                            // 그래서 명시적으로 null이면 coords도 다시 null로 비우고, onFinish의 이건 가드가 다시 걸리게 한다.
                            setCoords(meta.latitude && meta.longitude ? { latitude: meta.latitude, longitude: meta.longitude } : null);
                            form.setFieldsValue({ zipCode: meta.zipCode ?? '', addressDetail: meta.addressDetail ?? '' });
                        }}
                        onDetailChange={(v) => form.setFieldsValue({ addressDetail: v })}
                        placeholder="도로명 또는 지번 주소를 검색하세요"
                    />
                </Form.Item>
                <Form.Item name="zipCode" hidden><Input /></Form.Item>
                <Form.Item name="addressDetail" hidden><Input /></Form.Item>
                <Button variant="primary" htmlType="submit" loading={loading} block>
                    위치 저장
                </Button>
            </Form>
        </div>
    );
};

export default LocationTab;
