import React, { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FooterContent from './FooterContent';

const InquiryModal = lazy(() => import('../common/InquiryModal'));

export default function AppFooter() {
    const navigate = useNavigate();
    const [inquiryOpen, setInquiryOpen] = useState(() => new URLSearchParams(window.location.search).get('inquiry') === 'open');
    const [inquiryLoaded, setInquiryLoaded] = useState(inquiryOpen);
    const openInquiry = () => { setInquiryLoaded(true); setInquiryOpen(true); };
    const renderLink = (path, label) => <button type="button" className="reserve-app-footer-link reserve-text-link"
        onClick={() => path === '/?inquiry=open' ? openInquiry() : navigate(path)}>{label}</button>;
    return <>
        {inquiryLoaded && <Suspense fallback={null}><InquiryModal open={inquiryOpen} onClose={() => setInquiryOpen(false)} /></Suspense>}
        <FooterContent renderLink={renderLink} />
    </>;
}
