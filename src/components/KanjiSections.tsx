/**
 * 학습 카드의 답 영역(S3)과 한자 상세(S5)가 함께 쓰는 구역들 (SPEC 2.3 F1·F2·F3·F4·F8).
 * 켜고 끄기는 부르는 쪽이 settings 값으로 정한다.
 */

import { useMemo, useState } from 'react';
import type { Content, Kanji } from '../content/content';
import type { Relations } from '../content/relations';
import { formatKun } from '../domain/session';
import { matchingReadings, type SoundRule } from '../domain/soundRules';
import { Sheet } from './Sheet';
import styles from './KanjiSections.module.css';

export function hunumText(k: Kanji): string {
  return k.ko_main ? `${k.ko_main.hun} ${k.ko_main.eum}`.trim() : '';
}

/** 국자 표지 */
export function KokujiBadge() {
  return <span className={styles.kokuji}>일본 고유 한자</span>;
}

/** 신자체 ↔ 정자체 (F2). 정자체는 함께 놓인 한자의 60% 크기 */
export function KoFormInline({ kanji }: { kanji: Kanji }) {
  if (!kanji.ko_form) return null;
  return (
    <span className={styles.koForm} aria-label={`한국 정자체 ${kanji.ko_form}`}>
      <span lang="ja">{kanji.id}</span>
      <span className={styles.arrow} aria-hidden="true">
        ↔
      </span>
      <span lang="ko" className={styles.koFormChar}>
        {kanji.ko_form}
      </span>
    </span>
  );
}

/**
 * 한국어 줄 (카드)
 * - F1 켬 : 대표 훈음 크게, 나머지 훈음 작게, 뜻 풀이. 국자는 표지를 붙이고, 한국 자전에 훈음이 있으면(峠 고개 상) 함께 둔다
 * - F1 끔 : 뜻 풀이, 없으면 대표 훈음 하나만 (그것도 없으면 국자 표지)
 */
export function KoLine({ kanji, f1, f2 }: { kanji: Kanji; f1: boolean; f2: boolean }) {
  const noHunum = !kanji.ko_main;
  return (
    <div className={`${styles.row} ${f1 ? styles.rowKo : styles.rowPlain}`}>
      <span className={styles.rowLabel}>{f1 ? '한' : '뜻'}</span>
      <div className={styles.rowBody}>
        {f1 ? (
          <>
            <div className={styles.koHead}>
              {kanji.kokuji && <KokujiBadge />}
              {!noHunum && <span className={styles.koMain}>{hunumText(kanji)}</span>}
              {noHunum && !kanji.kokuji && <span className={styles.koMain}>—</span>}
              {f2 && <KoFormInline kanji={kanji} />}
            </div>
            {!noHunum && kanji.ko_more.length > 0 && (
              <p className={styles.koMore}>{kanji.ko_more.map((h) => `${h.hun} ${h.eum}`.trim()).join(', ')}</p>
            )}
            {kanji.meaning_ko && <p className={styles.meaning}>{kanji.meaning_ko}</p>}
          </>
        ) : (
          <div className={styles.koHead}>
            {kanji.meaning_ko ? (
              <span className={styles.plainMain}>{kanji.meaning_ko}</span>
            ) : noHunum ? (
              kanji.kokuji ? <KokujiBadge /> : <span className={styles.plainMain}>—</span>
            ) : (
              <span className={styles.plainMain}>{hunumText(kanji)}</span>
            )}
            {f2 && <KoFormInline kanji={kanji} />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 읽기 줄 (카드)
 * - F1 켬 : 音·訓을 색을 달리해 한 줄씩
 * - F1 끔 : 한 줄에 음독 / 훈독
 * 읽기 순서는 KANJIDIC2 순서 그대로, 모두 같은 굵기 (급수별 읽기 출처를 확정하기 전까지)
 */
export function ReadingLines({ kanji, f1 }: { kanji: Kanji; f1: boolean }) {
  const on = kanji.on.join('・');
  const kun = kanji.kun.map(formatKun).join('・');
  if (!f1) {
    return (
      <div className={`${styles.row} ${styles.rowPlain}`}>
        <span className={styles.rowLabel}>읽기</span>
        <span className={styles.reading} lang="ja">
          {[on, kun].filter(Boolean).join(' / ') || '—'}
        </span>
      </div>
    );
  }
  return (
    <>
      <div className={`${styles.row} ${styles.rowOn}`}>
        <span className={styles.rowLabel} lang="ja">
          音
        </span>
        <span className={styles.reading} lang="ja">
          {on || '—'}
        </span>
      </div>
      <div className={`${styles.row} ${styles.rowKun}`}>
        <span className={styles.rowLabel} lang="ja">
          訓
        </span>
        <span className={styles.reading} lang="ja">
          {kun || '—'}
        </span>
      </div>
    </>
  );
}

/** 이 한자에 붙은 규칙 (불러온 것만) */
export function rulesOf(kanji: Kanji, relations: Relations | null): SoundRule[] {
  if (!relations) return [];
  return kanji.rules.map((id) => relations.rules.get(id)).filter((r): r is SoundRule => !!r);
}

/** "첩 → チョウ" */
function ruleExample(kanji: Kanji, rule: SoundRule): string {
  const ons = matchingReadings(rule, kanji.on);
  return `${kanji.ko_main?.eum ?? ''} → ${ons.join('・')}`;
}

/** 💡 음 대응 힌트 한 줄 (F3). 누르면 규칙 시트 */
export function RuleHints({ kanji, relations, onOpen }: { kanji: Kanji; relations: Relations | null; onOpen: (ruleId: string) => void }) {
  const rules = rulesOf(kanji, relations);
  if (rules.length === 0) return null;
  return (
    <div className={styles.hints}>
      {rules.map((r) => (
        <button
          key={r.id}
          type="button"
          className={styles.hint}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(r.id);
          }}
        >
          <span aria-hidden="true">💡</span> {r.title}
          <span className={styles.hintExample} lang="ja">
            {ruleExample(kanji, r)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** 같은 규칙의 한자 (급수·순번 순서) */
export function sameRuleKanji(content: Content, ruleId: string): Kanji[] {
  const out: Kanji[] = [];
  for (const { ids } of content.levelIds) {
    for (const id of ids) {
      const k = content.byId.get(id);
      if (k?.rules.includes(ruleId)) out.push(k);
    }
  }
  return out;
}

/** 한자 칩 : 한자 + 대표 훈음. 누르면 그 한자 상세 */
export function KanjiChip({ kanji, onOpen, note }: { kanji: Kanji; onOpen: (id: string) => void; note?: string }) {
  return (
    <button
      type="button"
      className={styles.kchip}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(kanji.id);
      }}
    >
      <span className={styles.kchipKanji} lang="ja">
        {kanji.id}
      </span>
      <span className={styles.kchipText}>{note ?? (hunumText(kanji) || '일본 고유')}</span>
    </button>
  );
}

/** 같은 규칙의 한자 가로 목록 (F3 상세·규칙 시트) */
export function RuleKanjiStrip({ content, rule, self, onOpen }: { content: Content; rule: SoundRule; self?: string; onOpen: (id: string) => void }) {
  const list = useMemo(() => sameRuleKanji(content, rule.id).filter((k) => k.id !== self), [content, rule, self]);
  return (
    <div className={styles.strip} aria-label={`같은 규칙의 한자 ${list.length}자`}>
      {list.map((k) => (
        <KanjiChip key={k.id} kanji={k} onOpen={onOpen} note={`${k.ko_main?.eum ?? ''} ${matchingReadings(rule, k.on)[0] ?? ''}`.trim()} />
      ))}
    </div>
  );
}

/** 규칙 설명 시트 (카드의 💡을 눌렀을 때) */
export function RuleSheet({
  content,
  relations,
  ruleId,
  self,
  onClose,
  onOpenKanji,
}: {
  content: Content;
  relations: Relations | null;
  ruleId: string | null;
  self?: string;
  onClose: () => void;
  onOpenKanji: (id: string) => void;
}) {
  const rule = ruleId ? relations?.rules.get(ruleId) : undefined;
  return (
    <Sheet open={!!rule} title={rule ? `💡 ${rule.title}` : ''} onClose={onClose}>
      {rule && (
        <>
          <p className={styles.sheetText}>{rule.description}</p>
          <p className={styles.sheetSub}>같은 규칙의 한자 {sameRuleKanji(content, rule.id).length}자</p>
          <RuleKanjiStrip content={content} rule={rule} self={self} onOpen={onOpenKanji} />
        </>
      )}
    </Sheet>
  );
}

/** 같은 부분이 들어 있고 음독도 같은 한자 (F4. 데이터의 phonetic 묶음) */
export function phoneticMates(kanji: Kanji, content: Content, relations: Relations | null): { reading: string; component: string; mates: Kanji[] } | null {
  const g = kanji.phonetic ? relations?.groups.get(kanji.phonetic) : undefined;
  if (!g) return null;
  const mates = g.members.filter((m) => m !== kanji.id).map((m) => content.byId.get(m)).filter((k): k is Kanji => !!k);
  return mates.length ? { reading: g.reading, component: g.component, mates } : null;
}

export function PhoneticChips({ kanji, content, relations, onOpen }: { kanji: Kanji; content: Content; relations: Relations | null; onOpen: (id: string) => void }) {
  const p = phoneticMates(kanji, content, relations);
  if (!p) return null;
  return (
    <div className={styles.group}>
      <p className={styles.groupLabel}>
        <span lang="ja" className={styles.groupKey}>
          {p.component}
        </span>{' '}
        들어간 한자 · 음독{' '}
        <span lang="ja" className={styles.groupKey}>
          {p.reading}
        </span>
      </p>
      <div className={styles.chipRow}>
        {p.mates.map((k) => (
          <KanjiChip key={k.id} kanji={k} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

/**
 * 닮은 한자 (F8). 처음에는 접혀 있고, autoOpen이면 펼친 채로 시작한다
 * (공부하겠음을 2회 이상 받은 한자 + similar_auto_open)
 */
export function SimilarBlock({
  kanji,
  content,
  autoOpen,
  onOpen,
  onDetail,
}: {
  kanji: Kanji;
  content: Content;
  autoOpen: boolean;
  onOpen: (id: string) => void;
  onDetail?: () => void;
}) {
  const [open, setOpen] = useState(autoOpen);
  const list = kanji.similar.map((id) => content.byId.get(id)).filter((k): k is Kanji => !!k);
  if (list.length === 0) return null;
  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.groupToggle}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        닮은 한자
        {!open && (
          <span className={styles.collapsedPreview} lang="ja">
            {list.map((k) => k.id).join(' ')}
          </span>
        )}
        <span className={styles.caret} aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className={styles.compare}>
          {[kanji, ...list].map((k, i) => (
            <button
              key={k.id}
              type="button"
              className={`${styles.compareCell} ${i === 0 ? styles.compareSelf : ''}`}
              disabled={i === 0}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(k.id);
              }}
            >
              <span className={styles.compareKanji} lang="ja">
                {k.id}
              </span>
              <span className={styles.kchipText}>{hunumText(k) || '일본 고유'}</span>
              <span className={styles.compareOn} lang="ja">
                {k.on[0] ?? ''}
              </span>
            </button>
          ))}
        </div>
      )}
      {onDetail && (
        <button
          type="button"
          className={styles.detailLink}
          onClick={(e) => {
            e.stopPropagation();
            onDetail();
          }}
        >
          상세 보기 ›
        </button>
      )}
    </div>
  );
}
