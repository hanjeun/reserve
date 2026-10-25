/* 인라인 검증을 유지하고 제출 시 먼저 필요한 단계를 안내한다. */
export function reportLoginMethodFormError(failure, form, message) {
    if (failure?.outOfDate) return;
    const field = failure?.errorFields?.find(item => item.errors?.length);
    if (!field) return;
    message.info(field.errors[0]);
    form.getFieldInstance(field.name)?.focus?.();
}
