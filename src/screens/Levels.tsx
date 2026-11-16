import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ScreenShell } from '../components/ScreenShell';
import { ContentGate } from '../components/ContentGate';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { Stamp } from '../components/Stamp';
import { ProgressBar } from '../components/ProgressBar';
import { LockIcon } from '../components/icons';
import { STATUS_COLOR, STATUS_LABEL } from '../components/status';
import { levelName, type Chapter, type Content } from '../content/content';
import { chapterKey, isKnownOnce } from '../domain/progress';
import { roundDone, roundNumber } from '../domain/scheduler';
import type { CardState, ChapterProgress } from '../domain/types';
import { resetChapter } from '../db/study';
import { useProgressView } from '../db/useProgress';
import { useSettings } from '../settings/useSettings';
import styles from './Levels.module.css';

/** S2 단계 지도 */
export function Levels() {
  return (
    <ScreenShell title="단계">
      <ContentGate>{(content) => <LevelMap content={content} />}</ContentGate>
    </ScreenShell>
  );
}

function LevelMap({ content }: { content: Content }) {
  const [settings] = useSettings();
  const navigate = useNavigate();
  const view = useProgressView(content);
  const [selected, setSelected] = useState<Chapter | null>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  const progressByKey = useMemo(
    () => new Map((view?.rows ?? []).map((r) => [chapterKey(r.level, r.chapter), r])),
    [view],
  );

  // 화면에 들어오면 현재 학습 중인 장으로 스크롤
  const ready = view !== undefined;
  useEffect(() => {
    if (ready) currentRef.current?.scrollIntoView({ block: 'center' });
  }, [ready]);

  if (!view) return <p className={styles.loading}>기록을 불러오는 중…</p>;
  // 장 완료·열림은 진행 기록과 한자별 학습 상태로 계산한다 (장 크기를 바꿔도 학습한 범위는 잠기지 않음)
  const { cards } = view;
  const { completed, open, current, touched } = view.summary;

  return (
    <>
      {content.levels.map((lv) => {
        const known = lv.chapters.reduce(
          (n, ch) => n + ch.ids.filter((id) => isKnown(cards.get(id))).length,
          0,
        );
        return (
          <section key={lv.level} className={styles.level} aria-label={levelName(lv.level)}>
            <header className={styles.levelHeader}>
              <h2 className={styles.levelName}>{levelName(lv.level)}</h2>
              <span className={styles.levelCount}>
                {known} / {lv.count}자
              </span>
            </header>
            <ProgressBar value={known} max={lv.count} label={`${levelName(lv.level)} 진도`} />
            <ul className={styles.grid}>
              {lv.chapters.map((ch) => {
                const key = chapterKey(ch.level, ch.chapter);
                const p = progressByKey.get(key);
                const done = completed.has(key);
                const locked = !open.has(key);
                const isCurrent = current?.level === ch.level && current.chapter === ch.chapter;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      ref={isCurrent ? currentRef : undefined}
                      className={[styles.cell, locked ? styles.locked : '', isCurrent ? styles.current : ''].join(' ')}
                      onClick={() => setSelected(ch)}
                      aria-label={`${levelName(ch.level)} ${ch.chapter}장${locked ? ', 잠김' : ''}${done ? ', 완료' : ''}`}
                    >
                      <span className={styles.cellNo}>{ch.chapter}장</span>
                      <span className={styles.cellSub}>{chapterSub(p, done, touched.has(key))}</span>
                      {done ? (
                        <span className={styles.cellMark}>
                          <Stamp />
                        </span>
                      ) : locked ? (
                        <LockIcon className={styles.cellMark} width={16} height={16} />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {selected && (
        <ChapterSheet
          chapter={selected}
          content={content}
          progress={progressByKey.get(chapterKey(selected.level, selected.chapter))}
          done={completed.has(chapterKey(selected.level, selected.chapter))}
          srs={settings.f5_srs}
          cards={cards}
          locked={!open.has(chapterKey(selected.level, selected.chapter))}
          onClose={() => setSelected(null)}
          onStudy={() => navigate(`/study/${selected.level}/${selected.chapter}`)}
          onReset={async () => {
            await resetChapter(selected.level, selected.chapter, selected.ids, settings.card_order);
            navigate(`/study/${selected.level}/${selected.chapter}`);
          }}
        />
      )}
    </>
  );
}

/** 진도 : '알고있음'을 1회 이상 받았거나 졸업한 한자 (홈의 전체 진도와 같은 기준) */
const isKnown = isKnownOnce;

function chapterSub(p: ChapterProgress | undefined, done: boolean, touched: boolean): string {
  if (done) return p && p.pass_count > 0 ? `${p.pass_count}회독` : '완료';
  if (p && p.round_size > 0) return `${roundNumber(p)}회독 중`;
  return touched ? '학습 중' : '미학습';
}

interface SheetProps {
  chapter: Chapter;
  content: Content;
  progress: ChapterProgress | undefined;
  /** 완료한 장 (진행 기록 또는 한자별 학습 상태 기준) */
  done: boolean;
  /** 간격 반복(F5) 켬 */
  srs: boolean;
  cards: Map<string, CardState>;
  locked: boolean;
  onClose: () => void;
  onStudy: () => void;
  onReset: () => Promise<void>;
}

function ChapterSheet({ chapter, content, progress, done, srs, cards, locked, onClose, onStudy, onReset }: SheetProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const remaining = chapter.ids.filter((id) => !isKnown(cards.get(id))).length;

  let status = remaining < chapter.ids.length ? `학습 중 · 남은 한자 ${remaining}자` : '아직 시작하지 않은 장입니다.';
  if (done) status = progress && progress.pass_count > 0 ? `완료 · ${progress.pass_count}회독` : '완료';
  else if (progress && progress.round_size > 0) status = `${roundNumber(progress)}회독 · ${roundDone(progress)}/${progress.round_size} · 남은 한자 ${remaining}자`;

  return (
    <Sheet open title={`${levelName(chapter.level)} · ${chapter.chapter}장`} onClose={onClose}>
      <p className={styles.sheetStatus}>{status}</p>
      <ul className={styles.preview} aria-label="이 장의 한자">
        {chapter.ids.map((id) => {
          const st = cards.get(id)?.status ?? 'new';
          return (
            <li key={id} className={styles.previewCell} style={{ background: STATUS_COLOR[st] }} title={STATUS_LABEL[st]}>
              <span lang="ja">{content.byId.get(id)?.id}</span>
            </li>
          );
        })}
      </ul>
      <ul className={styles.legend}>
        {(['new', 'learning', 'review', 'graduated'] as const).map((st) => (
          <li key={st}>
            <span className={styles.swatch} style={{ background: STATUS_COLOR[st] }} />
            {STATUS_LABEL[st]}
          </li>
        ))}
      </ul>
      {locked ? (
        <Button block disabled>
          앞 장을 완료하면 열립니다
        </Button>
      ) : (
        <div className={styles.sheetActions}>
          {/* 회독 방식은 완료한 장을 다시 열지 않는다. 간격 반복은 그 장의 복습을 할 수 있다 */}
          {(!done || srs) && (
            <Button tone="primary" block onClick={onStudy}>
              {srs ? (done ? '이 장 복습' : '이 장 학습') : progress ? '이어서 학습' : '이 장 학습'}
            </Button>
          )}
          {(progress || done) &&
            (confirmReset ? (
              <Button block onClick={() => void onReset()}>
                학습 상태를 지우고 처음부터 (확인)
              </Button>
            ) : (
              <Button block onClick={() => setConfirmReset(true)}>
                처음부터 다시
              </Button>
            ))}
        </div>
      )}
    </Sheet>
  );
}
