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
import { chapterKey, currentChapter, unlockedChapters } from '../domain/progress';
import { roundDone, roundNumber } from '../domain/scheduler';
import type { CardState, ChapterProgress } from '../domain/types';
import { getAllCards, getAllChapters, resetChapter } from '../db/study';
import { useLive } from '../db/useLive';
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
  const rows = useLive(getAllChapters);
  const cards = useLive(getAllCards);
  const [selected, setSelected] = useState<Chapter | null>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  const progressByKey = useMemo(
    () => new Map((rows ?? []).map((r) => [chapterKey(r.level, r.chapter), r])),
    [rows],
  );
  const completed = useMemo(
    () => new Set((rows ?? []).filter((r) => r.completed_at !== null).map((r) => chapterKey(r.level, r.chapter))),
    [rows],
  );
  const open = useMemo(() => unlockedChapters(content.outline, completed, settings.level_lock), [content, completed, settings.level_lock]);
  const current = useMemo(() => currentChapter(content.outline, completed, settings.level_lock), [content, completed, settings.level_lock]);

  // 화면에 들어오면 현재 학습 중인 장으로 스크롤
  const ready = rows !== undefined && cards !== undefined;
  useEffect(() => {
    if (ready) currentRef.current?.scrollIntoView({ block: 'center' });
  }, [ready]);

  if (!ready) return <p className={styles.loading}>기록을 불러오는 중…</p>;

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
                const locked = !open.has(key);
                const isCurrent = current?.level === ch.level && current.chapter === ch.chapter;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      ref={isCurrent ? currentRef : undefined}
                      className={[styles.cell, locked ? styles.locked : '', isCurrent ? styles.current : ''].join(' ')}
                      onClick={() => setSelected(ch)}
                      aria-label={`${levelName(ch.level)} ${ch.chapter}장${locked ? ', 잠김' : ''}${p?.completed_at ? ', 완료' : ''}`}
                    >
                      <span className={styles.cellNo}>{ch.chapter}장</span>
                      <span className={styles.cellSub}>{chapterSub(p)}</span>
                      {p?.completed_at ? (
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

const isKnown = (c: CardState | undefined) => c?.status === 'review' || c?.status === 'graduated';

function chapterSub(p: ChapterProgress | undefined): string {
  if (!p) return '미학습';
  if (p.completed_at) return `${p.pass_count}회독`;
  return `${roundNumber(p)}회독 중`;
}

interface SheetProps {
  chapter: Chapter;
  content: Content;
  progress: ChapterProgress | undefined;
  cards: Map<string, CardState>;
  locked: boolean;
  onClose: () => void;
  onStudy: () => void;
  onReset: () => Promise<void>;
}

function ChapterSheet({ chapter, content, progress, cards, locked, onClose, onStudy, onReset }: SheetProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const remaining = chapter.ids.filter((id) => !isKnown(cards.get(id))).length;

  let status = '아직 시작하지 않은 장입니다.';
  if (progress?.completed_at) status = `완료 · ${progress.pass_count}회독`;
  else if (progress) status = `${roundNumber(progress)}회독 · ${roundDone(progress)}/${progress.round_size} · 남은 한자 ${remaining}자`;

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
          {!progress?.completed_at && (
            <Button tone="primary" block onClick={onStudy}>
              {progress ? '이어서 학습' : '이 장 학습'}
            </Button>
          )}
          {progress &&
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
