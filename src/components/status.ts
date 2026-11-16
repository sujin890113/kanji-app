import type { CardStatus } from '../domain/types';

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
