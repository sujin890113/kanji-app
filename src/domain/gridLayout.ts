/**
 * S6 한자 격자 줄 배치 (SPEC 6장 S6). 화면에 보이는 줄만 그리기 위해
 * 급수 머리글 줄과 한자 줄의 위치·높이를 미리 계산한다.
 */

export interface GridSection {
  level: number;
  ids: readonly string[];
}

export type GridRow =
  | { kind: 'header'; key: string; level: number; count: number; top: number; height: number }
  | { kind: 'cells'; key: string; level: number; ids: readonly string[]; top: number; height: number };

export interface GridLayout {
  rows: GridRow[];
  height: number;
}

/** 머리글 높이 headerHeight, 한자 줄 높이 rowHeight로 줄을 쌓는다. 빈 급수는 넣지 않는다 */
export function layoutGrid(sections: readonly GridSection[], cols: number, headerHeight: number, rowHeight: number): GridLayout {
  if (!Number.isInteger(cols) || cols <= 0) throw new Error(`열 수가 올바르지 않습니다: ${cols}`);
  const rows: GridRow[] = [];
  let top = 0;
  for (const s of sections) {
    if (s.ids.length === 0) continue;
    rows.push({ kind: 'header', key: `h${s.level}`, level: s.level, count: s.ids.length, top, height: headerHeight });
    top += headerHeight;
    for (let i = 0; i < s.ids.length; i += cols) {
      rows.push({ kind: 'cells', key: `c${s.level}:${i}`, level: s.level, ids: s.ids.slice(i, i + cols), top, height: rowHeight });
      top += rowHeight;
    }
  }
  return { rows, height: top };
}

/**
 * 보이는 줄의 범위 [start, end). viewTop·viewBottom은 격자 맨 위 기준 좌표.
 * overscan 픽셀만큼 위아래로 더 그려 빠르게 스크롤해도 빈칸이 보이지 않게 한다.
 */
export function visibleRows(rows: readonly GridRow[], viewTop: number, viewBottom: number, overscan = 0): [number, number] {
  const top = viewTop - overscan;
  const bottom = viewBottom + overscan;
  // 첫 줄 : 아래 끝이 top보다 아래인 첫 줄 (이진 탐색)
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].top + rows[mid].height <= top) lo = mid + 1;
    else hi = mid;
  }
  let end = lo;
  while (end < rows.length && rows[end].top < bottom) end += 1;
  return [lo, end];
}
