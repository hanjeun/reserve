import React from 'react';
import PropTypes from 'prop-types';
import { Image } from 'antd';

/**
 * 미리보기 포털 — **모듈 레벨**이어야 한다.
 *
 * 훅 안에서 만들면 렌더마다 새 컴포넌트 타입이 되어 소비 측이 자식 트리를 통째로 remount하고,
 * 그러면 닫힘 트랜지션이 묻힌다. 그걸 피하려고 참조를 고정하면 이번엔 클로저가 낡은 state를
 * 붙잡아서 ref 우회가 필요해진다 — 위 클래스 주석의 그 문제다.
 * 여기에 두면 타입이 고정되고 값은 props로 흐른다. 둘 다 해결된다.
 */
const ImagePreviewPortal = ({ open, items, current, sessionKey, onClose, onCurrentChange }) => {
    // items가 비워지는 시점이 닫힘 애니메이션 이후로 미뤄져 있어서, 이 early return이 애니메이션을 자르지 않는다.
    if (items.length === 0) return null;

    return (
        <Image.PreviewGroup
            /*
             * 세션마다 새 인스턴스를 마운트한다.
             * 닫힘 정리를 EXIT_DURATION만큼 미루기 때문에, 그 안에 다시 열면 아직 퇴장 중인 DOM이
             * 살아있다. AntD는 그 엘리먼트를 재사용하는데 퇴장 모션이 끝나기 전에 visible=true가
             * 되면 입장 모션이 병합되어 생략된다 — "빨리 열고 닫으면 여는 애니메이션만 씹힌다"의 원인.
             */
            key={sessionKey}
            items={items}
            preview={{
                visible: open,
                onVisibleChange: (visible) => { if (!visible) onClose(); },
                current,
                /*
                 * current를 controlled로 주면 AntD가 매 렌더 그 값으로 강제한다. 그래서 사용자의
                 * 넘김을 onChange로 되받아 state에 반영하지 않으면 화살표를 눌러도 시작 인덱스로
                 * 되돌아간다(넘김이 안 되던 버그의 원인).
                 */
                onChange: onCurrentChange,
                /*
                 * ⚠️ rootClassName은 antd 6에서 deprecated 경고가 뜨지만 일부러 되돌렸다(2026-07-30).
                 * 경고대로 classNames.root로 바꿨더니 preview 루트에 클래스가 아예 안 붙어
                 * .reserve-image-preview(둥근 네모 툴바·화살표·닫기) 스타일이 통째로 죽었다.
                 * 브라우저에서 확인: 미리보기 DOM에 우리 클래스 0건.
                 * antd의 semantic classNames에서 preview 루트는 popup.root 계열이라
                 * preview 안의 classNames.root와는 다른 자리다. 경고는 감수하고 동작을 택한다.
                 */
                rootClassName: 'reserve-image-preview',
            }}
        />
    );
};

ImagePreviewPortal.propTypes = {
    open: PropTypes.bool.isRequired,
    items: PropTypes.array.isRequired,
    current: PropTypes.number.isRequired,
    sessionKey: PropTypes.number.isRequired,
    onClose: PropTypes.func.isRequired,
    onCurrentChange: PropTypes.func.isRequired,
};

export default ImagePreviewPortal;
