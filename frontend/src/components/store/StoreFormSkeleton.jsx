import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import { field } from '../../styles/tokens/field';

const Field = ({ textarea = false }) => (
    <div className={`reserve-store-form-skeleton-field${textarea ? ' reserve-store-form-skeleton-field--textarea' : ''}`}>
        <Bone width={76} height={14} />
        <Bone
            height={textarea ? 112 : field.height}
            borderRadius={field.radius}
            style={textarea ? undefined : { minHeight: field.height }}
        />
    </div>
);
Field.propTypes = { textarea: PropTypes.bool };

const FieldRow = ({ children }) => (
    <div className="reserve-store-form-skeleton-row">{children}</div>
);
FieldRow.propTypes = { children: PropTypes.node.isRequired };

const SectionDivider = () => <Bone height={1} borderRadius={0} />;

// 초기 데이터/페이지 청크가 준비되는 동안만 표시한다. 제출 로딩은 실제 폼을 유지한다.
export default function StoreFormSkeleton() {
    return (
        <div className="reserve-store-form-skeleton">
            <div className="reserve-store-form-skeleton-heading">
                <Bone width="45%" height={28} />
                <Bone width="65%" height={16} />
            </div>

            <div className="reserve-store-form-skeleton-grid">
                <div className="reserve-store-form-skeleton-column" data-skeleton-section="basic">
                    <Field />
                    <FieldRow><Field /><Field /></FieldRow>
                    <Field />
                    <FieldRow><Field /><Field /></FieldRow>
                    <FieldRow><Field /><Field /></FieldRow>
                    <Field />
                    <Field textarea />
                </div>

                <div className="reserve-store-form-skeleton-divider" />

                <div className="reserve-store-form-skeleton-column" data-skeleton-section="settings">
                    <FieldRow><Field /><Field /></FieldRow>
                    <Field />
                    <SectionDivider />
                    <Bone width={88} height={14} />
                    <div className="reserve-store-form-skeleton-toggles">
                        {['approval', 'payment', 'duplicate', 'mail'].map(key => (
                            <div className="reserve-store-form-skeleton-toggle" key={key}>
                                <div><Bone width="42%" height={14} /><Bone width="74%" height={12} /></div>
                                <Bone width={30} height={18} borderRadius={20} />
                            </div>
                        ))}
                    </div>
                    <SectionDivider />
                    <Bone width={104} height={14} />
                    <Field />
                    <FieldRow><Field /><Field /></FieldRow>
                    <SectionDivider />
                    <FieldRow><Field /><Field /></FieldRow>
                </div>
            </div>

            <div className="reserve-store-form-skeleton-images" data-skeleton-section="images">
                <SectionDivider />
                <Bone width={88} height={16} />
                <div className="reserve-store-form-skeleton-upload-group">
                    <Bone width={76} height={14} />
                    <Bone width={104} height={104} borderRadius={10} />
                    <Bone width="72%" height={12} />
                </div>
                <div className="reserve-store-form-skeleton-upload-group">
                    <Bone width={132} height={14} />
                    <div className="reserve-store-form-skeleton-uploads">
                        {['one', 'two', 'three'].map(key => <Bone key={key} width={104} height={104} borderRadius={10} />)}
                    </div>
                    <Bone width="58%" height={12} />
                </div>
            </div>

            <div className="reserve-store-form-skeleton-actions" data-skeleton-section="actions">
                <Bone width="55%" height={12} />
                <div><Bone height={field.height} borderRadius={field.radius} /><Bone height={field.height} borderRadius={field.radius} /></div>
            </div>
        </div>
    );
}
