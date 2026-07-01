import { Pagination } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { colors, fontWeight, fontSize } from '../../styles/tokens';

// ── 토스 스타일 페이지네이션 ───────────────────────────────────────────────────
// 선택: 어두운 배경 + 흰 숫자 / 호버: 연한 회색 / radius: 10px 둥근 사각형
// 모바일: 40px (너무 작지 않게) / 스프링 스케일 애니메이션
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_BG   = colors.text.primary;
const HOVER_BG    = colors.gray[100];
const TEXT_COLOR  = colors.text.secondary;
const RADIUS      = '10px';
const SIZE_PC     = '36px';
const SIZE_MOBILE = '40px';

const paginationStyles = `
  .toss-pagination.ant-pagination {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 2px !important;
    flex-wrap: wrap !important;
    padding: 4px 0 !important;
  }
  .toss-pagination .ant-pagination-item {
    min-width: ${SIZE_PC} !important;
    height: ${SIZE_PC} !important;
    line-height: ${SIZE_PC} !important;
    border-radius: ${RADIUS} !important;
    border: none !important;
    background: transparent !important;
    margin: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: background-color 0.15s ease !important;
  }
  .toss-pagination .ant-pagination-item a {
    font-size: ${fontSize.sm} !important;
    font-weight: ${fontWeight.medium} !important;
    color: ${TEXT_COLOR} !important;
    padding: 0 !important;
    line-height: ${SIZE_PC} !important;
    display: block !important;
    width: 100% !important;
    text-align: center !important;
  }
  .toss-pagination .ant-pagination-item:hover {
    background-color: ${HOVER_BG} !important;
  }
  .toss-pagination .ant-pagination-item:hover a {
    color: ${colors.text.primary} !important;
  }
  /* 선택된 번호 — 스프링 스케일 + 배경 전환 */
  .toss-pagination .ant-pagination-item-active {
    background-color: ${ACTIVE_BG} !important;
    border: none !important;
    transform: scale(1.07) !important;
    transition: background-color 0.2s ease,
                transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
  }
  .toss-pagination .ant-pagination-item-active a {
    color: #ffffff !important;
    font-weight: ${fontWeight.semibold} !important;
  }
  .toss-pagination .ant-pagination-item-active:hover {
    background-color: ${ACTIVE_BG} !important;
    opacity: 0.9 !important;
  }
  /* 이전 / 다음 버튼 */
  .toss-pagination .ant-pagination-prev,
  .toss-pagination .ant-pagination-next {
    min-width: ${SIZE_PC} !important;
    height: ${SIZE_PC} !important;
    border-radius: ${RADIUS} !important;
    border: none !important;
    margin: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .toss-pagination .ant-pagination-prev .ant-pagination-item-link,
  .toss-pagination .ant-pagination-next .ant-pagination-item-link {
    border-radius: ${RADIUS} !important;
    border: none !important;
    background: transparent !important;
    color: ${TEXT_COLOR} !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 100% !important;
    height: 100% !important;
    transition: background-color 0.15s ease !important;
  }
  .toss-pagination .ant-pagination-prev:hover .ant-pagination-item-link,
  .toss-pagination .ant-pagination-next:hover .ant-pagination-item-link {
    background-color: ${HOVER_BG} !important;
    color: ${colors.text.primary} !important;
  }
  .toss-pagination .ant-pagination-disabled .ant-pagination-item-link {
    opacity: 0.35 !important;
    cursor: not-allowed !important;
    background: transparent !important;
  }
  /* 줄임표 (…) */
  .toss-pagination .ant-pagination-jump-prev,
  .toss-pagination .ant-pagination-jump-next {
    min-width: ${SIZE_PC} !important;
    height: ${SIZE_PC} !important;
    border-radius: ${RADIUS} !important;
    border: none !important;
    margin: 0 !important;
    color: ${TEXT_COLOR} !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  /* 모바일: 버튼 크기 40px (너무 작지 않게) */
  @media (max-width: 768px) {
    .toss-pagination .ant-pagination-item {
      min-width: ${SIZE_MOBILE} !important;
      height: ${SIZE_MOBILE} !important;
      line-height: ${SIZE_MOBILE} !important;
    }
    .toss-pagination .ant-pagination-item a {
      font-size: ${fontSize.base} !important;
      line-height: ${SIZE_MOBILE} !important;
    }
    .toss-pagination .ant-pagination-prev,
    .toss-pagination .ant-pagination-next,
    .toss-pagination .ant-pagination-jump-prev,
    .toss-pagination .ant-pagination-jump-next {
      min-width: ${SIZE_MOBILE} !important;
      height: ${SIZE_MOBILE} !important;
    }
  }
`;

export default function CustomPagination({ current, total, pageSize = 10, onChange, style }) {
    return (
        <>
            <style>{paginationStyles}</style>
            <Pagination
                className="toss-pagination"
                current={current}
                total={total}
                pageSize={pageSize}
                onChange={onChange}
                showSizeChanger={false}
                prevIcon={<LeftOutlined style={{ fontSize: 12 }} />}
                nextIcon={<RightOutlined style={{ fontSize: 12 }} />}
                style={{ display: 'flex', justifyContent: 'center', ...style }}
            />
        </>
    );
}
