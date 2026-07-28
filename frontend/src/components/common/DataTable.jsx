import React from 'react';
import PropTypes from 'prop-types';
import { Table } from 'antd';
import { useWindowWidth } from '../../hooks/useWindowWidth';

/**
 * RESERVE Design System - DataTable Component
 *
 * 관리자/사업자 패널의 모든 목록 테이블에 공통 적용되는 표준 설정을 하나로 묶은 래퍼.
 * (2026-07-08: 사업자 광고 탭이 관리자 탭들과 다른 size="small"을 써서 여백이 더 좁아 보이는
 * 불일치가 있었음 — 앞으로 새 테이블은 raw <Table> 대신 이 컴포넌트를 써서 이런 불일치를 방지)
 *
 * 기본값: size="middle"(여유로운 행 높이), tableLayout="fixed"(각 열의 width가 비율 힌트가 아니라
 *   실제 고정 픽셀값이 되게 함 — AntD Table 기본값인 table-layout:auto에서는 열 너비 합계보다
 *   테이블 컨테이너가 넓을 때 width가 "비율 힌트"로만 쓰여서 모든 열이 비례적으로 늘어나는 문제가
 *   있었음, 2026-07-09 실측(offsetWidth)으로 확인 후 수정), scroll={{x:'max-content'}}(좁은 화면에서
 *   페이지 전체가 아니라 테이블 내부만 가로 스크롤).
 *
 * fitContent: 모든 열에 명시적 width를 주고(유동 열 없음) 있는 그대로 두고 싶은 테이블에서 true로
 *   설정 — AntD가 scroll.x 설정 시 <table>에 강제로 붙이는 min-width:100%를 무력화해서, 테이블이
 *   컨테이너 전체 폭이 아니라 실제 열 너비 합계만큼만 차지하게 함. 반대로 의도적으로 한 열(예:
 *   이메일)을 남는 공간에 맞춰 늘어나게 하고 싶은 테이블(대부분의 관리자 탭)에서는 기본값(false) 유지.
 *
 * ── 페이지네이션 컨벤션 (2026-07 전수조사) ─────────────────────────────────────
 * 페이지 버튼 개수는 AntD 기본 규칙을 따른다:
 *   - 전체 5페이지 이하  → 전부 나열   (1 2 3)
 *   - 6페이지 이상       → 처음/끝 + 현재 주변 + 생략(…) 점프 버튼
 * "1페이지에선 1 2만 보이고 2로 가야 3이 보인다"는 제보가 있었는데, 실측(감사로그 22건, 10개/페이지)
 * 결과 정상적으로 1 2 3이 모두 렌더된다 — 제보 당시엔 로그가 20건 이하라 실제로 2페이지였을 뿐이다.
 * (서버 페이지네이션 탭은 total을 반드시 넘겨야 한다. 안 넘기면 AntD가 현재 페이지의 dataSource
 *  길이로 페이지 수를 계산해서 실제보다 적게 나온다 — AuditLogTab/AdminAdsTab 모두 배선 확인됨)
 *
 * PC와 모바일에 같은 개수를 보여주면 모바일에서 페이지 버튼이 줄바꿈되거나 잘린다.
 *   - PC(>=576px)  : AntD 기본 (현재 페이지 ±2, 최대 7개 남짓)
 *   - 모바일(<576) : showLessItems(현재 ±1로 버튼 수 축소) + size="small"(컨트롤 축소)
 * simple 모드("‹ 1/3 ›" 입력형)는 페이지 번호를 직접 누를 수 없어 오히려 불편하므로 쓰지 않는다.
 *
 * 사용법:
 * <DataTable columns={columns} dataSource={data} rowKey="id" />                    // 기본 페이지네이션
 * <DataTable columns={columns} dataSource={data} rowKey="id" pagination={false} />  // 페이지네이션 없음
 * <DataTable columns={columns} dataSource={data} rowKey="id" pageSize={20} />       // 페이지 크기만 변경
 * <DataTable columns={columns} dataSource={data} rowKey="id" fitContent />          // 모든 열이 고정폭, 늘어나지 않음
 */
const MOBILE_BREAKPOINT = 576;

const DataTable = ({ pageSize = 15, pagination, size = 'middle', fitContent = false, className, ...rest }) => {
    const isMobile = useWindowWidth() < MOBILE_BREAKPOINT;

    const paginationConfig = pagination === false ? false : {
        pageSize,
        showSizeChanger: false,
        // 모바일에선 페이지 버튼 개수와 크기를 줄인다 (위 컨벤션 주석 참고)
        showLessItems: isMobile,
        ...pagination,
    };

    return (
        <Table
            size={size}
            tableLayout="fixed"
            scroll={{ x: 'max-content' }}
            className={[fitContent ? 'reserve-table-fit-content' : '', className].filter(Boolean).join(' ') || undefined}
            pagination={paginationConfig}
            {...rest}
        />
    );
};

// components/common의 공용 컴포넌트는 PropTypes 필수 (docs/rules/code-conventions.md).
// columns/dataSource 등 나머지 Table props는 ...rest로 그대로 위임하므로 여기서 다시 선언하지 않는다 —
// 이 컴포넌트가 직접 해석하는 prop만 계약으로 명시한다.
DataTable.propTypes = {
    /** 페이지당 행 수 (pagination이 false면 무시) */
    pageSize: PropTypes.number,
    /** false면 페이지네이션 비활성, 객체면 기본 설정에 병합 */
    pagination: PropTypes.oneOfType([PropTypes.bool, PropTypes.object]),
    /** AntD Table size — 기본 middle로 통일(관리자/사업자 패널 간 여백 불일치 방지) */
    size: PropTypes.oneOf(['small', 'middle', 'large']),
    /** 모든 열이 고정폭일 때 true — 테이블이 컨테이너 전체 폭을 차지하지 않게 함 */
    fitContent: PropTypes.bool,
    className: PropTypes.string,
};

export default DataTable;
