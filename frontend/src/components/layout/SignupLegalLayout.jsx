import { useState } from 'react';
import PropTypes from 'prop-types';
import { Outlet, useLocation } from 'react-router-dom';
import useDocumentTitle from '../../hooks/useDocumentTitle';

function SignupDocumentTitle({ social }) {
    useDocumentTitle(social ? '서비스 이용 동의' : '회원가입');
    return null;
}
SignupDocumentTitle.propTypes = { social: PropTypes.bool };

/** 약관을 보는 동안 가입 폼과 인증 증거를 메모리에만 유지해요. */
export default function SignupLegalLayout({ signup, socialAgreement }) {
    const { pathname } = useLocation();
    const path = pathname.replace(/\/+$/, '');
    const currentForm = path === '/signup' || path === '/signup/social' ? path : null;
    const [retainedForm, setRetainedForm] = useState(currentForm);
    if (currentForm && retainedForm !== currentForm) setRetainedForm(currentForm);
    const form = currentForm || retainedForm;

    return <>
        {currentForm && <SignupDocumentTitle social={currentForm === '/signup/social'} />}
        {form && <div hidden={!currentForm} inert={!currentForm || undefined} aria-hidden={!currentForm || undefined}>
            {form === '/signup/social' ? socialAgreement : signup}
        </div>}
        <Outlet />
    </>;
}
SignupLegalLayout.propTypes = { signup: PropTypes.node.isRequired, socialAgreement: PropTypes.node.isRequired };
