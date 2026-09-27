import PropTypes from 'prop-types';
import { Pagination } from 'antd';
import { colors } from '../../styles/tokens';
import Bone from './Bone';

// 관리자 표면의 Pagination 의존성이 초기 라우트 스켈레톤에 유입되지 않도록 분리한다.
const skeletonKeys = (n, prefix = 'sk') => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

/* ─────────────────────────────────────────────
   AdminTableSkeleton — 관리자/사업자 패널 테이블 로딩용
───────────────────────────────────────────── */

// AntD Table size="middle"의 셀 패딩 (cellPaddingBlockMD=12, cellPaddingInlineMD=8).
// 실제 테이블은 이 패딩이 컬럼 width 안에 포함되므로 스켈레톤도 똑같이 맞춰야 글자 시작 위치가 일치한다.
const CELL_PAD_Y = 12;
const CELL_PAD_X = 8;
// width를 지정하지 않은 "유동 컬럼"이 너무 좁아지지 않도록 하한
const FLEX_COL_MIN = 160;

/**
 * props:
 *   rows       {number}          행 개수
 *   cols       {(number|null)[]} 각 열의 width(px). null이면 "width 미지정(유동) 컬럼"
 *   headers    {string[]}        각 열의 제목 (고정 텍스트라 스켈레톤으로 가리지 않고 실제 글자로 렌더)
 *   actionBtns {number}          마지막 열에 그릴 버튼 Bone 개수. 0이면 텍스트 Bone
 *   stackFirstCol {bool}         첫 열이 "이름 + 이메일" 2줄인 테이블(사업자 인증 탭)만 true
 *   pagination {object|null}     { current, pageSize, total } — 주면 스켈레톤 중에도 페이지 버튼 유지
 *
 * ── 컬럼 폭 계산: 실제 테이블과 수학적으로 동일하게 (2026-07 수정) ─────────────────
 * DataTable은 tableLayout="fixed"이고 AntD가 <table>에 min-width:100%를 붙인다.
 * 그래서 지정 width 합계가 컨테이너보다 작으면 브라우저가 "남는 공간을 지정 폭에 비례해서"
 * 나눠준다(CSS 2.1 §17.5.2.1). 예: 사업자 인증 탭은 합계 890px → 실제 약 1435px = 약 1.61배 확대.
 * 예전 스켈레톤은 고정 px를 그대로 써서 로딩이 끝나는 순간 셀 경계가 우르르 밀렸다.
 *   → flexGrow: w, flexBasis: w 로 주면 최종 폭 = w × (컨테이너/합계) 로 정확히 같은 비례 확대가 된다.
 *   → flexShrink: 0 이라 모바일처럼 좁을 땐 줄지 않고 가로 스크롤이 생긴다(실제 테이블과 동일).
 * 단, width를 안 준 컬럼(=null)이 하나라도 있으면 규칙이 달라진다 — 고정 컬럼은 지정 폭을
 * 그대로 쓰고 유동 컬럼이 남는 공간을 혼자 흡수한다.
 * (실제로 유동 컬럼이 있는 탭: AuditLogTab의 '로그 내용', TrashTab의 '핵심 정보' — 이 둘뿐)
 */
const AdminTableSkeleton = ({
  rows = 8,
  cols = [160, 140, 120, 100, 90, 180],
  headers,
  // 마지막 열이 항상 버튼 열인 것은 아니다. 호출부가 실제 버튼 수를 명시해야만 버튼 Bone을 그린다.
  actionBtns = 0,
  stackFirstCol = false,
  pagination = null,
}) => {
  const lastIdx = cols.length - 1;
  const hasFlexCol = cols.some((w) => w == null);
  // 컬럼/행 key — 배열 인덱스를 key로 쓰지 않기 위해 미리 만들어 두는 안정적인 문자열 key
  const colKeys = skeletonKeys(cols.length, 'col');
  const rowKeys = skeletonKeys(rows, 'row');

  // 위 주석의 규칙을 그대로 구현
  const colStyle = (w) => {
    const base = { boxSizing: 'border-box', padding: `0 ${CELL_PAD_X}px`, minWidth: 0 };
    if (w == null) {
      return { ...base, flexGrow: 1, flexShrink: 1, flexBasis: FLEX_COL_MIN, minWidth: FLEX_COL_MIN };
    }
    if (hasFlexCol) {
      return { ...base, flexGrow: 0, flexShrink: 0, flexBasis: w };
    }
    return { ...base, flexGrow: w, flexShrink: 0, flexBasis: w };
  };

  return (
    <div>
      <div
        style={{
          border: `1px solid ${colors.gray[100]}`,
          borderRadius: 8,
          // 2026-07 수정: 예전엔 overflow:'hidden'이라 모바일처럼 화면이 좁을 때 컬럼 너비 합계를
          // 넘어가는 부분이 그냥 잘려나가고 가로 스크롤도 안 됐다. 정작 실제 테이블은
          // scroll={{ x: 'max-content' }}라 가로 스크롤이 되기 때문에 "로딩 중엔 오른쪽 컬럼을 볼 수가
          // 없다가 로딩이 끝나면 갑자기 스크롤이 생기는" 불일치가 있었다.
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {/* 헤더 행 — 고정 텍스트이므로 스켈레톤으로 가리지 않고 실제 제목을 그대로 노출 */}
        <div
          style={{
            display: 'flex',
            padding: `${CELL_PAD_Y}px 0`,
            background: colors.gray[50],
            borderBottom: `1px solid ${colors.gray[100]}`,
            minWidth: 'max-content',
          }}
        >
          {cols.map((w, i) => (
            <div
              key={colKeys[i]}
              style={{
                ...colStyle(w),
                // 실제 AntD <th>와 동일: fontSize 14(테마 기본) / fontWeight 600 / 본문과 같은 진한 색.
                // 예전엔 13px + text.secondary라 스켈레톤과 실제 테이블의 헤더 글자가 미세하게 달라 보였다.
                fontSize: 14,
                fontWeight: 600,
                color: colors.text.primary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {headers?.[i] ?? ''}
            </div>
          ))}
        </div>

        {/* 데이터 행들 */}
        {rowKeys.map((rowKey, ri) => (
          <div
            key={rowKey}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: `${CELL_PAD_Y}px 0`,
              borderBottom: ri < rows - 1 ? `1px solid ${colors.gray[100]}` : 'none',
              background: colors.background.default,
              minWidth: 'max-content',
            }}
          >
            {cols.map((w, ci) => {
              const style = colStyle(w);

              // 마지막 열은 호출부가 actionBtns를 선언한 경우에만 "처리" 버튼 열이다.
              if (ci === lastIdx) {
                return (
                  <div key={colKeys[ci]} style={{ ...style, display: 'flex', alignItems: 'center', gap: 6, minHeight: 22 }}>
                    {actionBtns > 0
                      ? skeletonKeys(actionBtns, 'btn').map((btnKey) => (
                        <Bone key={btnKey} width={52} height={22} borderRadius={4} />
                      ))
                      : <Bone width="70%" height={14} />}
                  </div>
                );
              }

              // 사업자 인증 탭처럼 첫 열이 "이름 + 이메일" 2줄인 경우
              if (ci === 0 && stackFirstCol) {
                return (
                  <div key={colKeys[ci]} style={{ ...style, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Bone width="60%" height={14} />
                    <Bone width="85%" height={12} />
                  </div>
                );
              }

              return (
                <div key={colKeys[ci]} style={{ ...style, display: 'flex', alignItems: 'center', minHeight: 22 }}>
                  <Bone width={`${55 + (ci % 3) * 15}%`} height={14} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 페이지네이션 — 스켈레톤 중에도 유지한다 (2026-07 추가)
          예전엔 스켈레톤이 <DataTable>을 통째로 대체해서 페이지 버튼까지 같이 사라졌다 —
          페이지를 넘길 때마다 방금 누른 버튼이 사라졌다 다시 나타나는 게 오히려 어색했다.
          페이지 버튼은 total/current만 알면 그릴 수 있고, keepPreviousData 덕에 그 값은 이미 알고 있다.
          로딩 중엔 누를 수 없게 disabled 처리한다. */}
      {pagination && (
        <Pagination
          disabled
          current={pagination.current}
          pageSize={pagination.pageSize}
          total={pagination.total}
          showSizeChanger={false}
          style={{ marginTop: 16 }}
        />
      )}
    </div>
  );
};

AdminTableSkeleton.propTypes = {
  rows: PropTypes.number,
  // 각 열의 width(px). null이면 width 미지정(유동) 컬럼
  cols: PropTypes.arrayOf(PropTypes.number),
  headers: PropTypes.arrayOf(PropTypes.string),
  actionBtns: PropTypes.number,
  stackFirstCol: PropTypes.bool,
  pagination: PropTypes.shape({
    current: PropTypes.number,
    pageSize: PropTypes.number,
    total: PropTypes.number,
  }),
};

export default AdminTableSkeleton;
