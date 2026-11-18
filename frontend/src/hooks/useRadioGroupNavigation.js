import { useRef } from 'react';

export default function useRadioGroupNavigation({ options, value, onChange, disabled }) {
    const buttons = useRef([]);
    const enabled = options.flatMap((option, index) => !disabled && !option.disabled ? [index] : []);
    const selected = options.findIndex(option => option.value === value);
    const tabStop = enabled.includes(selected) ? selected : enabled[0];

    return index => ({
        ref: node => { buttons.current[index] = node; },
        tabIndex: index === tabStop ? 0 : -1,
        onKeyDown: event => {
            if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
                || !enabled.includes(index)) return;
            const position = enabled.indexOf(index);
            let target;
            if (event.key === 'Home') target = enabled[0];
            else if (event.key === 'End') target = enabled.at(-1);
            else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = enabled[(position + 1) % enabled.length];
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = enabled[(position - 1 + enabled.length) % enabled.length];
            else return;
            event.preventDefault();
            event.stopPropagation();
            buttons.current[target]?.focus();
            if (options[target].value !== value) onChange(options[target].value);
        },
    });
}
