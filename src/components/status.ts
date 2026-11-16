import type { CardStatus } from '../domain/types';
import type { GridState } from '../domain/stats';

/** 학습 상태 → 격자 칸 색 (SPEC 5.3 역할 고정표) */
export const STATUS_COLOR: Record<CardStatus, string> = {
  new: 'var(--cell-new)',
  learning: 'var(--cell-learning)',
  review: 'var(--cell-know)',
  graduated: 'var(--cell-graduated)',
};

export const STATUS_LABEL: Record<CardStatus, string> = {
  new: '미학습',
  learning: '학습 중',
  review: '알고있음',
  graduated: '졸업',
};

/** 격자 칸 상태(미학습 / 학습 중 / 애매 / 알고있음 / 졸업) → 색 (SPEC 5.3) */
export const GRID_COLOR: Record<GridState, string> = {
  new: 'var(--cell-new)',
  learning: 'var(--cell-learning)',
  vague: 'var(--cell-vague)',
  know: 'var(--cell-know)',
  graduated: 'var(--cell-graduated)',
};

export const GRID_LABEL: Record<GridState, string> = {
  new: '미학습',
  learning: '학습 중',
  vague: '애매',
  know: '알고있음',
  graduated: '졸업',
};
