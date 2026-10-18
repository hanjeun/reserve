import { PlusOutlined } from './icons';

/** 가게 등록과 글 작성의 picture-card 추가 칸. */
export default function ImageUploadButton() {
    return <div>
        <PlusOutlined aria-hidden="true" />
        <div style={{ marginTop: 8 }}>업로드</div>
    </div>;
}
