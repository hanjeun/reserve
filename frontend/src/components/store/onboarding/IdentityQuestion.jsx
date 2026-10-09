import { Form, Input } from 'antd';
import { FormInput, FormTextArea } from '../../common';
import AddressSearch from '../StoreForm/AddressSearch';
import StoreImages from '../StoreForm/StoreImages';
import { onboardingFieldRules } from '../../../utils/storeOnboarding';
import { useQuestionValues } from './questionValues';
const identityValues = values => ({zipCode: values.zipCode, addressDetail:values.addressDetail});
export function IdentityQuestion({ change, mode = 'create', ...images }) {
    const values = useQuestionValues(identityValues);
    return <>
        <Form.Item label="가게 이름" name="name" rules={onboardingFieldRules('name', values)}><FormInput placeholder="가게 이름" /></Form.Item>
        <Form.Item label="주소" name="address" rules={onboardingFieldRules('address', values)}>
            <AddressSearch zipCode={values.zipCode || ''} addressDetail={values.addressDetail || ''}
                onMeta={change} onDetailChange={addressDetail => change({ addressDetail })} />
        </Form.Item>
        {['latitude', 'longitude', 'zipCode', 'addressDetail'].map(name => <Form.Item key={name} name={name} hidden><Input /></Form.Item>)}
        <Form.Item label="연락처" name="phone" rules={onboardingFieldRules('phone', values)}><FormInput placeholder="02-1234-5678" /></Form.Item>
        <Form.Item label="가게 소개" name="description" rules={onboardingFieldRules('description', values)}><FormTextArea rows={3} placeholder="가게를 소개해주세요" /></Form.Item>
        <StoreImages {...images} mainImageRequired={mode === 'create'} />
    </>;
}
