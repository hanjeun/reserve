/** Keep the form's inline validation and explain the first missing step after submission. */
export function reportLoginMethodFormError(failure, form, message) {
    if (failure?.outOfDate) return;
    const field = failure?.errorFields?.find(item => item.errors?.length);
    if (!field) return;
    message.info(field.errors[0]);
    form.getFieldInstance(field.name)?.focus?.();
}
