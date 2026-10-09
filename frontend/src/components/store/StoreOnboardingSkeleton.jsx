import PageContainer from '../common/PageContainer';
import { PageTitle } from '../common/PageTypography';
import Bone from '../common/Bone';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { SERVICE_DOMAIN_OPTIONS } from '../../constants';
import { STORE_FORM_DENSITY_VARS, storeFormFrame } from './storeFormFrame';
import { STORE_EDIT_SECTIONS, STORE_EDIT_SELECTION_HELP } from '../../utils/storeOnboarding';
import { heights, radius } from '../../styles/tokens';

export default function StoreOnboardingSkeleton({ mode = 'create' }) {
    const { container, isMobile } = storeFormFrame(useWindowWidth());
    const edit = mode === 'edit';
    const controlHeight = isMobile ? 'var(--reserve-store-form-control-height, 44px)' : heights.input;
    const buttonHeight = isMobile ? 'var(--reserve-store-form-control-height, 44px)' : heights.buttonLg;
    const buttonRadius = isMobile ? 'var(--reserve-store-form-control-radius, 10px)' : radius.xl;
    return <PageContainer {...container} className="reserve-store-form-page reserve-onboarding-page" style={STORE_FORM_DENSITY_VARS}>
        <div className="reserve-onboarding-shell">
            <PageTitle level={1} className="reserve-onboarding-heading">{edit ? '무엇을 수정하시겠어요?' : '어떤 가게를 운영하시나요?'}</PageTitle>
            <div className="reserve-store-form reserve-store-form-skeleton">
                {edit ? <div className="reserve-onboarding-edit-selection">
                    <p className="reserve-onboarding-help">{STORE_EDIT_SELECTION_HELP}</p>
                    <div className="reserve-service-domain-picker" aria-hidden="true">
                        {STORE_EDIT_SECTIONS.map(section => <div className="reserve-service-domain-option" key={section.value}>
                            <span className="reserve-service-domain-option__media"><Bone width={56} height={56} borderRadius="50%" /></span>
                            <span className="reserve-service-domain-option__label"><Bone width={section.label.length * 14} height={20} /></span>
                        </div>)}
                    </div>
                </div> : <>
                    <div className="reserve-store-form-skeleton-label">서비스 분야</div>
                    <div className="reserve-service-domain-picker" aria-hidden="true">
                        {SERVICE_DOMAIN_OPTIONS.map(option => <div className="reserve-service-domain-option" key={option.value}>
                            <span className="reserve-service-domain-option__media"><Bone width={56} height={56} borderRadius="50%" /></span>
                            <span className="reserve-service-domain-option__label"><Bone width={32} height={20} /></span>
                        </div>)}
                    </div>
                    <div className="reserve-store-form-skeleton-label">업종</div>
                    <Bone height={controlHeight} />
                    <p className="reserve-onboarding-help">조금 더 구체적으로 알려주세요. 예: 필라테스, 네일샵, 한식</p>
                </>}
                {edit && <Bone width="80%" height={19} style={{ marginTop: 32, marginBottom: 10 }} />}
                <div style={{ display: 'flex', gap: 12, marginTop: edit ? 0 : 32 }} aria-hidden="true">
                    <Bone height={buttonHeight} borderRadius={buttonRadius} style={{ flex: '1 1 0', minWidth: 0 }} />
                    <Bone height={buttonHeight} borderRadius={buttonRadius} style={{ flex: '1 1 0', minWidth: 0 }} />
                </div>
            </div>
        </div>
    </PageContainer>;
}
