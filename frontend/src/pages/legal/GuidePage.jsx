import PropTypes from 'prop-types';
import { ArrowRightOutlined } from '@ant-design/icons';
import TextLink from '../../components/common/TextLink';
import PageContainer from '../../components/common/PageContainer';
import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useMessagesEntry from '../../hooks/useMessagesEntry';
import { GUIDE_PAGES, guideStyles } from './GuidePageMetadata';

export function GuideParagraph({ children }) {
    return <p style={guideStyles.paragraph}>{children}</p>;
}
GuideParagraph.propTypes = { children: PropTypes.node.isRequired };

export function GuideLinks({ links }) {
    const { onMessagesLinkClick } = useMessagesEntry();
    return <div style={guideStyles.links}>
        {links.map(link => <TextLink key={link.to} to={link.to} style={guideStyles.link}
            onClick={link.to === '/messages' ? onMessagesLinkClick : undefined}>
            {link.label}<ArrowRightOutlined aria-hidden="true" />
        </TextLink>)}
    </div>;
}
GuideLinks.propTypes = { links: PropTypes.arrayOf(PropTypes.shape({ to: PropTypes.string.isRequired, label: PropTypes.string.isRequired })).isRequired };

export default function GuidePage({ pathname, sections }) {
    const guide = GUIDE_PAGES[pathname];
    useDocumentTitle(guide.title, guide.description);
    return <PageContainer size="md" paddingTop="60px">
        <header style={guideStyles.header}>
            <PageTitle level={1} style={guideStyles.title}>{guide.title}</PageTitle>
            <PageDescription style={guideStyles.description}>{guide.description}</PageDescription>
        </header>
        <nav aria-label="이용안내" style={guideStyles.navigation}>
            {Object.entries(GUIDE_PAGES).map(([path, page]) => <TextLink key={path} to={path}
                aria-current={path === pathname ? 'page' : undefined}
                style={guideStyles.navigationItem}>
                {page.title}
            </TextLink>)}
        </nav>
        {guide.sections.map(section => <section key={section.id} id={section.id} style={guideStyles.section}>
            <h2 style={guideStyles.sectionTitle}>{section.title}</h2>
            <div style={guideStyles.body}>{sections[section.id]}</div>
        </section>)}
    </PageContainer>;
}
GuidePage.propTypes = { pathname: PropTypes.oneOf(Object.keys(GUIDE_PAGES)).isRequired, sections: PropTypes.objectOf(PropTypes.node).isRequired };
