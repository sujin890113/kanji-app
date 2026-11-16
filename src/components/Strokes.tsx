/**
 * F10 획순 및 따라 쓰기 (SPEC 2.3, S5 5번)
 * - 애니메이션 : KanjiVG 획 경로를 한 획씩 그린다. 속도(stroke_speed)와 획 번호(stroke_numbers)는 설정을 따른다.
 * - 따라 쓰기 : 전체 화면 시트. 흐린 본보기 위에 손가락으로 쓴다. 채점은 하지 않는다 (1차 구현).
 */

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { Kanji } from '../content/content';
import { useStrokes, type StrokeData } from '../content/lazyData';
import { strokeTimeline } from '../domain/speech';
import { useSettings } from '../settings/useSettings';
import { Button } from './Button';
import { CloseIcon, PenIcon, PlayIcon } from './icons';
import styles from './Strokes.module.css';

/** 칸 안내선 (가로·세로 가운데 점선) */
function Guides() {
  return (
    <g className={styles.guides} aria-hidden="true">
      <rect x="0.5" y="0.5" width="108" height="108" />
      <path d="M54.5 0v109M0 54.5h109" />
    </g>
  );
}

function StrokeAnimation({ data, run }: { data: StrokeData; run: number }) {
  const [settings] = useSettings();
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const nums = useRef<(SVGTextElement | null)[]>([]);

  useLayoutEffect(() => {
    const els = paths.current.slice(0, data.strokes.length);
    const lengths = els.map((el) => (el ? el.getTotalLength() : 0));
    const { steps } = strokeTimeline(lengths, settings.stroke_speed);
    const anims: Animation[] = [];
    els.forEach((el, i) => {
      if (!el) return;
      const len = lengths[i] + 1;
      el.style.strokeDasharray = `${len} ${len}`;
      anims.push(
        el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
          delay: steps[i].delay,
          duration: steps[i].duration,
          easing: 'ease-in-out',
          fill: 'both',
        }),
      );
      const num = nums.current[i];
      if (num) anims.push(num.animate([{ opacity: 0 }, { opacity: 1 }], { delay: steps[i].delay, duration: 120, fill: 'both' }));
    });
    return () => anims.forEach((a) => a.cancel());
  }, [data, run, settings.stroke_speed, settings.stroke_numbers]);

  return (
    <svg viewBox="0 0 109 109" className={styles.svg} role="img" aria-label={`획순 ${data.strokes.length}획`}>
      <Guides />
      <g className={styles.shadow}>
        {data.strokes.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className={styles.ink}>
        {data.strokes.map((d, i) => (
          <path key={`${run}-${i}`} d={d} ref={(el) => void (paths.current[i] = el)} />
        ))}
      </g>
      {settings.stroke_numbers && (
        <g className={styles.numbers}>
          {data.numbers.map(([x, y], i) => (
            <text key={`${run}-${i}`} x={x} y={y} ref={(el) => void (nums.current[i] = el)}>
              {i + 1}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}

/** S5 획순 구역 : 애니메이션 칸, [다시 재생], [따라 쓰기] */
export function StrokeSection({ kanji }: { kanji: Kanji }) {
  const data = useStrokes(kanji.id);
  const [run, setRun] = useState(0);
  const [tracing, setTracing] = useState(false);
  useEffect(() => setTracing(false), [kanji.id]);

  return (
    <section className={styles.section} aria-label="획순">
      <h2 className={styles.title}>
        획순 <span className={styles.count}>{data ? `${data.strokes.length}획` : ''}</span>
      </h2>
      {data === undefined && <p className={styles.muted}>획순을 불러오는 중…</p>}
      {data === null && <p className={styles.muted}>획순 데이터를 불러오지 못했습니다.</p>}
      {data && (
        <>
          <button type="button" className={styles.box} aria-label="획순 다시 재생" onClick={() => setRun((n) => n + 1)}>
            <span lang="ja" className={styles.boxInner}>
              <StrokeAnimation data={data} run={run} />
            </span>
          </button>
          <div className={styles.actions}>
            <Button onClick={() => setRun((n) => n + 1)}>
              <PlayIcon width={18} height={18} /> 다시 재생
            </Button>
            <Button tone="primary" onClick={() => setTracing(true)}>
              <PenIcon width={18} height={18} /> 따라 쓰기
            </Button>
          </div>
          {tracing && <TracingSheet kanji={kanji} data={data} onClose={() => setTracing(false)} />}
        </>
      )}
    </section>
  );
}

type Point = [number, number];

function toPath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  // 점 하나만 찍은 경우에도 보이도록 같은 자리로 선을 긋는다
  const tail = rest.length ? rest : [first];
  return `M${first[0].toFixed(1)} ${first[1].toFixed(1)}` + tail.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('');
}

/** 따라 쓰기 전체 화면 시트. 쓴 선은 시트를 닫으면 사라진다 */
function TracingSheet({ kanji, data, onClose }: { kanji: Kanji; data: StrokeData; onClose: () => void }) {
  const [settings] = useSettings();
  const [lines, setLines] = useState<Point[][]>([]);
  const [current, setCurrent] = useState<Point[] | null>(null);
  const [showModel, setShowModel] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pointOf = (e: PointerEvent<SVGSVGElement>): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 109, ((e.clientY - r.top) / r.height) * 109];
  };

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setCurrent([pointOf(e)]);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!current) return;
    const p = pointOf(e);
    const last = current[current.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.6) return;
    setCurrent([...current, p]);
  };
  const up = () => {
    if (current) setLines((ls) => [...ls, current]);
    setCurrent(null);
  };

  return (
    <div className={styles.trace} role="dialog" aria-modal="true" aria-label={`${kanji.id} 따라 쓰기`}>
      <header className={styles.traceHeader}>
        <button type="button" className={styles.iconButton} aria-label="닫기" onClick={onClose}>
          <CloseIcon />
        </button>
        <p className={styles.traceTitle}>
          따라 쓰기 · <span lang="ja">{kanji.id}</span>
        </p>
        <span className={styles.traceCount} aria-live="polite">
          {lines.length} / {data.strokes.length}획
        </span>
      </header>

      <div className={styles.padWrap}>
        <svg
          ref={svgRef}
          viewBox="0 0 109 109"
          className={styles.pad}
          lang="ja"
          aria-label="쓰는 칸. 손가락이나 펜으로 쓰세요"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <Guides />
          {showModel && (
            <g className={styles.model}>
              {data.strokes.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          )}
          {showModel && settings.stroke_numbers && (
            <g className={styles.modelNumbers}>
              {data.numbers.map(([x, y], i) => (
                <text key={i} x={x} y={y}>
                  {i + 1}
                </text>
              ))}
            </g>
          )}
          <g className={styles.user}>
            {lines.map((l, i) => (
              <path key={i} d={toPath(l)} />
            ))}
            {current && <path d={toPath(current)} />}
          </g>
        </svg>
      </div>

      <p className={styles.traceHint}>채점은 하지 않습니다. 본보기와 겹쳐 보며 비교해 보세요.</p>

      <div className={styles.traceActions}>
        <Button disabled={lines.length === 0} onClick={() => setLines((ls) => ls.slice(0, -1))}>
          한 획 지우기
        </Button>
        <Button disabled={lines.length === 0} onClick={() => setLines([])}>
          지우기
        </Button>
        <Button aria-pressed={!showModel} onClick={() => setShowModel((v) => !v)}>
          {showModel ? '본보기 숨김' : '본보기 보기'}
        </Button>
      </div>
    </div>
  );
}
