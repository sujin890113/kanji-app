import { describe, expect, it } from 'vitest';
import { layoutGrid, visibleRows } from './gridLayout';

const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);

describe('격자 줄 배치', () => {
  const g = layoutGrid(
    [
      { level: 5, ids: ids(10, 'a') },
      { level: 4, ids: [] },
      { level: 3, ids: ids(8, 'b') },
    ],
    8,
    40,
    50,
  );
  it('급수마다 머리글 1줄 + 8칸씩 나눈 줄, 빈 급수는 뺀다', () => {
    expect(g.rows.map((r) => r.kind + (r.kind === 'cells' ? r.ids.length : r.level))).toEqual([
      'header5',
      'cells8',
      'cells2',
      'header3',
      'cells8',
    ]);
    expect(g.rows.map((r) => r.top)).toEqual([0, 40, 90, 140, 180]);
    expect(g.height).toBe(230);
  });
  it('급수 경계마다 줄을 새로 시작한다 (8칸·16칸)', () => {
    const levels = [79, 166, 367, 367, 1157].map((n, i) => ({ level: 5 - i, ids: ids(n, `${i}-`) }));
    const cells8 = layoutGrid(levels, 8, 40, 50).rows.filter((r) => r.kind === 'cells').length;
    const cells16 = layoutGrid(levels, 16, 40, 25).rows.filter((r) => r.kind === 'cells').length;
    expect(cells8).toBe(10 + 21 + 46 + 46 + 145);
    expect(cells16).toBe(5 + 11 + 23 + 23 + 73);
  });
  it('열 수가 0 이하이면 오류', () => {
    expect(() => layoutGrid([], 0, 1, 1)).toThrow();
  });
});

describe('보이는 줄', () => {
  const { rows } = layoutGrid([{ level: 5, ids: ids(80, 'a') }], 8, 40, 50); // 머리글 + 10줄, 높이 540
  it('화면에 걸친 줄만 고른다', () => {
    expect(visibleRows(rows, 0, 100)).toEqual([0, 3]); // 0~40 머리글, 40~90, 90~140
    expect(visibleRows(rows, 95, 180)).toEqual([2, 4]);
  });
  it('overscan만큼 위아래로 넓힌다', () => {
    expect(visibleRows(rows, 200, 250, 60)).toEqual([3, 7]); // 140~310 : 140에서 끝나는 줄은 뺀다
  });
  it('범위 밖이면 빈 범위', () => {
    expect(visibleRows(rows, 1000, 1200)).toEqual([11, 11]);
    expect(visibleRows([], 0, 100)).toEqual([0, 0]);
  });
});
