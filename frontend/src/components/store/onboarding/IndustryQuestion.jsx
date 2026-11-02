import { useState } from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import ServiceDomainPicker from '../ServiceDomainPicker';
import RollingFormInput from '../../common/RollingFormInput';
import { onboardingFieldRules } from '../../../utils/storeOnboarding';
import { SERVICE_DOMAIN_OPTIONS } from '../../../constants';
import { useQuestionValues } from './questionValues';
const industryValues = values => ({ serviceDomain: values.serviceDomain, category: values.category });
function CategoryInput({ value, ...props }) {
    // 순서는 Form이 실제로 표시하는 글자와 함께 계산해요.
    const order = SERVICE_DOMAIN_OPTIONS.findIndex(option => option.label === value);
    return <RollingFormInput {...props} value={value} replacementOrder={order < 0 ? undefined : order} />;
}
CategoryInput.propTypes = { value: PropTypes.string };
export function IndustryQuestion({ change }) {
    const values = useQuestionValues(industryValues);
    const [replacementKey, setReplacementKey] = useState(0);
    const selectedLabel = SERVICE_DOMAIN_OPTIONS.find(option => option.value === values.serviceDomain)?.label;
    const selectIndustry = serviceDomain => {
        const category = SERVICE_DOMAIN_OPTIONS.find(option => option.value === serviceDomain)?.label;
        setReplacementKey(key => key + 1);
        change({ serviceDomain, category });
    };
    return <>
        <Form.Item label="서비스 분야" name="serviceDomain" rules={onboardingFieldRules('serviceDomain', values)}>
            <ServiceDomainPicker selectedValue={values.category === selectedLabel ? values.serviceDomain : null} onChange={selectIndustry} />
        </Form.Item>
        <Form.Item label="업종" name="category" rules={onboardingFieldRules('category', values)}
            extra="조금 더 구체적으로 알려주세요. 예: 필라테스, 네일샵, 한식">
            <CategoryInput replacementKey={replacementKey} placeholder="업종" maxLength={30} />
        </Form.Item>
    </>;
}
