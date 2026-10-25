import PropTypes from 'prop-types';
import { colors } from '../../styles/tokens';
import Bone from './Bone';
import SkeletonText from './SkeletonText';

// 표 본문만 그리며 페이지 이동 도구는 AdminTableSkeleton이 담당한다.
// 라우트 골격에서 쓰는 경량 파일이므로 Pagination을 가져오지 않는다.
const skeletonKeys = (n, prefix = 'sk') => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

/*   AdminTableSkeleton — 관리자/사업자 패널 테이블 로딩용*/

// AntD Table size="middle"의 셀 패딩 (cellPaddingBlockMD=12, cellPaddingInlineMD=8).
// 실제 테이블은 이 패딩이 컬럼 width 안에 포함되므로 스켈레톤도 똑같이 맞춰야 글자 시작 위치가 일치한다.
const CELL_PAD_Y = 12;
const CELL_PAD_X = 8;
// width를 지정하지 않은 "유동 컬럼"이 너무 좁아지지 않도록 하한
const FLEX_COL_MIN = 160;

/*
 * rows {number}, cols {(number|null)[]}, headers {string[]}, actionBtns {number}, stackFirstCol {bool}, pagination {object|null}.
 * CSS 2.1 §17.5.2.1에 맞춰 고정 열만 있으면 폭 비율로 확장하고 null 열이 있으면 남는 공간을 그 열에 둔다. 좁은 화면에서는 축소하지 않고 가로 스크롤을 유지한다.
 */
const AdminTableSkeletonTable = ({
  rows = 8,
  cols = [160, 140, 120, 100, 90, 180],
  headers,
  // 마지막 열이 항상 버튼 열인 것은 아니다. 호출부가 실제 버튼 수를 명시해야만 버튼 Bone을 그린다.
  actionBtns = 0,
  stackFirstCol = false,
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
      <div
        style={{
          border: `1px solid ${colors.gray[100]}`,
          borderRadius: 8,
          // 좁은 화면에서도 열 너비를 유지하고 가로 스크롤을 허용한다.

          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {/* 헤더도 본문과 함께 골격으로 표시하며 실제 제목의 폭을 유지한다. */}
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
                // 열 제목은 실제 테이블의 글꼴·색상·정렬을 유지한다.

                fontSize: 14,
                fontWeight: 600,
                color: colors.text.primary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <SkeletonText>{headers?.[i] ?? ''}</SkeletonText>
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

  );
};

AdminTableSkeletonTable.propTypes = {
  rows: PropTypes.number,
  // 각 열의 width(px). null이면 width 미지정(유동) 컬럼
  cols: PropTypes.arrayOf(PropTypes.number),
  headers: PropTypes.arrayOf(PropTypes.string),
  actionBtns: PropTypes.number,
  stackFirstCol: PropTypes.bool,
};

export default AdminTableSkeletonTable;
