import { Form } from 'antd';
import { STORE_ONBOARDING_DEFAULTS } from '../../../utils/storeOnboarding';
export const useQuestionValues = selector => {
 const form = Form.useFormInstance();
 const watched = Form.useWatch(selector, {form, preserve:true});
 return {...STORE_ONBOARDING_DEFAULTS, ...watched};
};
const policyValues = values => ({reservationEnabled:values.reservationEnabled, bookingType:values.bookingType, noShowDeposit:values.noShowDeposit, _depositEnabled:values._depositEnabled, allowLatePayment:values.allowLatePayment, fullRefundDays:values.fullRefundDays, partialRefundDays:values.partialRefundDays});
export const usePolicyValues = () => useQuestionValues(policyValues);
