import PropTypes from 'prop-types';

export default function MailHtmlPreview({ html }) {
    const document = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><meta name="viewport" content="width=device-width, initial-scale=1">');
    return <iframe title="발송될 메일 디자인" className="reserve-mail-preview" srcDoc={document}
        sandbox="" referrerPolicy="no-referrer" />;
}

MailHtmlPreview.propTypes = { html: PropTypes.string.isRequired };
