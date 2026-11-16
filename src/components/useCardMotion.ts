/**
 * 학습 카드의 움직임 (SPEC 5.6, S3 조작표)
 * - 판정 시 카드가 나간다 : 알고있음·졸업은 오른쪽으로 돌며, 공부하겠음은 왼쪽 아래로 작아지며, 애매함은 위로.
 * - 스와이프 : 끄는 동안 카드가 손가락을 따라오고, 가장자리에 판정 색과 라벨이 진해진다.
 * - 새 카드는 짧게 나타난다. '동작 줄이기'가 켜져 있으면 이동·회전 없이 투명도만 바뀐다.
 * 라이브러리 없이 Pointer Events와 Web Animations API로 만든다.
 */

import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { dragRotation, swipeDirection, swipeProgress, swipeRating, type SwipeOptions } from '../domain/swipe';
import type { Rating } from '../domain/types';

export interface SwipeHint {
  rating: Rating;
  /** 0~1 진하기 */
  progress: number;
}

const DRAG_START = 10;
const EXIT_EASE = 'cubic-bezier(0.4, 0, 1, 1)';

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 토큰(--dur-*)의 ms 값 */
function tokenMs(name: string, fallback: number): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? (v.endsWith('s') && !v.endsWith('ms') ? n * 1000 : n) : fallback;
}

const EXIT_TO: Record<Rating, string> = {
  know: 'translateX(130%) rotate(14deg)',
  graduate: 'translateX(130%) rotate(14deg)',
  study: 'translate(-120%, 24px) scale(0.92) rotate(-6deg)',
  vague: 'translateY(-120%)',
};

interface Options {
  /** 스와이프 판정을 받는가 (swipe_enabled, 역방향 카드는 펼친 뒤에만) */
  swipe: boolean;
  threeGrade: boolean;
  /** 카드가 바뀔 때마다 달라지는 값 (나타나기 움직임) */
  cardKey: string;
  onSwipe: (rating: Rating) => void;
}

export function useCardMotion({ swipe, threeGrade, cardKey, onSwipe }: Options) {
  const ref = useRef<HTMLElement | null>(null);
  const [hint, setHint] = useState<SwipeHint | null>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; dx: number; dy: number; t: number; v: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // 새 카드 : 남아 있던 나가기 움직임을 지우고 짧게 나타난다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.style.transform = '';
    setHint(null);
    el.animate(
      [
        { opacity: 0, transform: reducedMotion() ? 'none' : 'scale(0.97)' },
        { opacity: 1, transform: 'none' },
      ],
      { id: 'enter', duration: tokenMs('--dur-fast', 150), easing: 'ease-out' },
    );
  }, [cardKey]);

  const options = (): SwipeOptions => ({
    threeGrade,
    threshold: Math.min(120, (ref.current?.clientWidth ?? 360) * 0.3),
  });

  /** 판정 움직임. 끝날 때까지 기다린다 */
  const exit = async (rating: Rating) => {
    const el = ref.current;
    if (!el) return;
    setHint({ rating, progress: 1 });
    const reduced = reducedMotion();
    if (rating === 'graduate' && !reduced) {
      // 졸업 : 카드에 작은 도장이 찍힌 뒤 나간다
      await new Promise((r) => setTimeout(r, tokenMs('--dur-grade', 220)));
    }
    const from = el.style.transform || 'none';
    const duration = tokenMs('--dur-grade', 220);
    const anim = el.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { transform: from, opacity: 1 },
            { transform: EXIT_TO[rating], opacity: 0 },
          ],
      { duration, easing: EXIT_EASE, fill: 'forwards' },
    );
    // 화면이 그려지지 않는 동안(백그라운드 등)에도 판정이 멈추지 않도록 정해진 시간이 지나면 넘어간다
    await Promise.race([anim.finished.catch(() => undefined), new Promise((r) => setTimeout(r, duration + 80))]);
  };

  const snapBack = () => {
    const el = ref.current;
    setHint(null);
    if (!el) return;
    const from = el.style.transform;
    el.style.transform = '';
    if (from && !reducedMotion()) {
      el.animate([{ transform: from }, { transform: 'none' }], { duration: tokenMs('--dur-progress', 200), easing: 'ease-out' });
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!swipe || e.button !== 0 || drag.current) return;
    if ((e.target as Element).closest('button, a, input, [data-no-swipe]')) return;
    // 나타나기 움직임이 남아 있으면 끝내고 끌기를 시작한다 (움직임이 끌기 위치를 덮지 않게)
    ref.current?.getAnimations().forEach((a) => a.id === 'enter' && a.finish());
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, t: e.timeStamp, v: 0, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || d.id !== e.pointerId || !el) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      d.moved = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // 잡지 못해도 끌기는 계속한다
      }
    }
    // 끄는 방향의 속도 (px/ms)
    const dt = Math.max(1, e.timeStamp - d.t);
    const dir = swipeDirection(dx, dy, threeGrade);
    const step = dir === 'vague' ? d.dy - dy : Math.abs(dx) - Math.abs(d.dx);
    d.v = step / dt;
    d.t = e.timeStamp;
    d.dx = dx;
    d.dy = dy;
    // 아래로는 거의 움직이지 않는다 (아래쪽 판정 없음). F6이 꺼지면 위로도 조금만
    const y = dy > 0 ? dy * 0.15 : threeGrade ? dy : dy * 0.3;
    el.style.transform = reducedMotion()
      ? ''
      : `translate(${dx}px, ${y}px) rotate(${dragRotation(dx, el.clientWidth)}deg)`;
    const p = Math.round(swipeProgress(dx, dy, options()) * 10) / 10;
    setHint((h) => (dir && p > 0 ? (h?.rating === dir && h.progress === p ? h : { rating: dir, progress: p }) : null));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    suppressClick.current = true;
    const rating = swipeRating(d.dx, d.dy, options(), d.v);
    if (rating) onSwipe(rating);
    else snapBack();
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) snapBack();
  };

  /** 끈 뒤에 따라오는 click은 카드 펼치기로 처리하지 않는다 */
  const onClickCapture = (e: ReactMouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /** 판정이 기록되지 않았을 때 카드를 제자리로 */
  const reset = () => {
    const el = ref.current;
    setHint(null);
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.style.transform = '';
  };

  return {
    ref,
    hint,
    exit,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture },
  };
}
