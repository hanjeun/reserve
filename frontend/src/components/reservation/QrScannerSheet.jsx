import PropTypes from 'prop-types';
import { Modal } from 'antd';
import QrScannerTab from './QrScannerTab';

/** RegionSheet와 같은 데스크톱 다이얼로그/모바일 바텀시트 표면을 쓰는 QR 체크인. */
export default function QrScannerSheet({ open, onClose }) {
    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={520}
            zIndex={1100}
            transitionName="reserve-region-sheet-motion"
            destroyOnHidden
            rootClassName="reserve-region-sheet-root reserve-qr-sheet-root"
            className="reserve-region-sheet reserve-qr-sheet"
            title={<span id="reserve-qr-sheet-title">QR 체크인</span>}
            aria-labelledby="reserve-qr-sheet-title"
        >
            <QrScannerTab sheet onClose={onClose} />
        </Modal>
    );
}

QrScannerSheet.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
};
