import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenShell } from '../components/ScreenShell';
import { ContentGate } from '../components/ContentGate';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { StarIcon } from '../components/icons';
import { STATUS_COLOR, STATUS_LABEL } from '../components/status';
import {
  KanjiChip,
  KokujiBadge,
  KoLine,
  PhoneticChips,
  ReadingLines,
  RuleKanjiStrip,
  rulesOf,
} from '../components/KanjiSections';
import { levelName, type Content, type Kanji } from '../content/content';
import { useRelations } from '../content/relations';
import { formatKun } from '../domain/session';
import { matchingReadings } from '../domain/soundRules';
import type { Rating } from '../domain/types';
import { getKanjiLogs, resetKanji, toggleFavorite } from '../db/study';
import { db } from '../db/database';
import { useLive } from '../db/useLive';
import { useSettings } from '../settings/useSettings';
import styles from './Detail.module.css';

/** S5 한자 상세 (탭 숨김) */
export function Detail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  return (
    <ScreenShell title="한자 상세" back>
      <ContentGate>
        {(content) => <DetailBody content={content} id={id} onOpen={(next) => navigate(`/kanji/${encodeURIComponent(next)}`)} />}
      </ContentGate>
    </ScreenShell>
  );
}

const RATING_LABEL: Record<Rating, string> = { study: '공부하겠음', vague: '애매함', know: '알고있음', graduate: '졸업' };
const RATING_CLASS: Record<Rating, string> = { study: styles.dotStudy, vague: styles.dotVague, know: styles.dotKnow, graduate: styles.dotGraduate };
const dueFormat = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * 상세 본문. 위에서부터 머리 → 음훈(F1) → 정자체 대조(F2) → 음 대응(F3) → 같은 음부(F4)·닮은 한자(F8) → 내 기록.
 * 꺼진 기능의 구역은 그리지 않는다. 획순(F10)·대표 단어(F9)는 M5.
 * 학습 카드 위에 겹쳐 열 때도 이 본문을 쓴다 (onOpen으로 다음 한자를 여는 방법만 다르다).
 */
export function DetailBody({ content, id, onOpen }: { content: Content; id: string; onOpen: (id: string) => void }) {
  const [settings] = useSettings();
  const relations = useRelations();
  const kanji = content.byId.get(id) ?? content.byId.get(content.meta.aliases[id] ?? '');
  if (!kanji) return <p className={styles.muted}>상용한자 목록에 없는 한자입니다.</p>;
  const rules = rulesOf(kanji, relations);
  const similar = kanji.similar.map((s) => content.byId.get(s)).filter((k): k is Kanji => !!k);

  return (
    <div className={styles.body}>
      <Head kanji={kanji} />

      {settings.f1_hunum ? (
        <section className={styles.section} aria-label="음훈">
          <h2 className={styles.sectionTitle}>음훈</h2>
          <div className={`${styles.line} ${styles.lineKo}`}>
            <span className={styles.lineLabel}>한</span>
            <div className={styles.lineBody}>
              {kanji.kokuji && <KokujiBadge />}
              {!kanji.ko_main ? (
                !kanji.kokuji && <span>—</span>
              ) : (
                <>
                  <span className={styles.koMain}>{`${kanji.ko_main.hun} ${kanji.ko_main.eum}`.trim()}</span>
                  {kanji.ko_more.map((h) => (
                    <span key={`${h.hun}${h.eum}`} className={styles.koMore}>
                      {`${h.hun} ${h.eum}`.trim()}
                    </span>
                  ))}
                </>
              )}
              {kanji.meaning_ko && <p className={styles.meaning}>{kanji.meaning_ko}</p>}
            </div>
          </div>
          <div className={`${styles.line} ${styles.lineOn}`}>
            <span className={styles.lineLabel} lang="ja">
              音
            </span>
            <div className={styles.lineBody}>
              {kanji.on.length ? (
                kanji.on.map((o) => (
                  <span key={o} className={styles.reading} lang="ja">
                    {o}
                  </span>
                ))
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
          <div className={`${styles.line} ${styles.lineKun}`}>
            <span className={styles.lineLabel} lang="ja">
              訓
            </span>
            <div className={styles.lineBody}>
              {kanji.kun.length ? (
                kanji.kun.map((r) => (
                  <span key={r} className={styles.reading} lang="ja">
                    {formatKun(r)}
                  </span>
                ))
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
        </section>
      ) : (
        // F1을 꺼도 학습 카드와 같이 읽기와 뜻은 보여준다 (SPEC 2.2 F1 끔)
        <section className={styles.section} aria-label="읽기와 뜻">
          <KoLine kanji={kanji} f1={false} f2={false} />
          <ReadingLines kanji={kanji} f1={false} />
        </section>
      )}

      {settings.f2_ko_form && kanji.ko_form && (
        <section className={styles.section} aria-label="정자체 대조">
          <h2 className={styles.sectionTitle}>정자체 대조</h2>
          <div className={styles.forms}>
            <figure className={styles.form}>
              <span className={styles.formChar} lang="ja">
                {kanji.id}
              </span>
              <figcaption className={styles.formLabel}>일본</figcaption>
            </figure>
            <figure className={styles.form}>
              <span className={`${styles.formChar} ${styles.formKo}`} lang="ko">
                {kanji.ko_form}
              </span>
              <figcaption className={styles.formLabel}>한국</figcaption>
            </figure>
          </div>
        </section>
      )}

      {settings.f3_sound_rule && rules.length > 0 && (
        <section className={styles.section} aria-label="음 대응">
          <h2 className={styles.sectionTitle}>음 대응</h2>
          {rules.map((r) => (
            <div key={r.id} className={styles.rule}>
              <p className={styles.ruleTitle}>
                <span aria-hidden="true">💡</span> {r.title}
                <span className={styles.ruleExample} lang="ja">
                  {kanji.ko_main?.eum} → {matchingReadings(r, kanji.on).join('・')}
                </span>
              </p>
              <p className={styles.ruleText}>{r.description}</p>
              <RuleKanjiStrip content={content} rule={r} self={kanji.id} onOpen={onOpen} />
            </div>
          ))}
        </section>
      )}

      {settings.f4_phonetic && kanji.phonetic && (
        <section className={styles.section} aria-label="같은 음부">
          <PhoneticChips kanji={kanji} content={content} relations={relations} onOpen={onOpen} />
        </section>
      )}

      {settings.f8_similar && similar.length > 0 && (
        <section className={styles.section} aria-label="닮은 한자">
          <p className={styles.groupLabel}>닮은 한자</p>
          <div className={styles.chipRow}>
            {similar.map((k) => (
              <KanjiChip key={k.id} kanji={k} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      <MyRecord kanji={kanji} srs={settings.f5_srs} />
    </div>
  );
}

function Head({ kanji }: { kanji: Kanji }) {
  const card = useLive(() => db.cards.get([kanji.id, 'forward']), [kanji.id]);
  const status = card?.status ?? 'new';
  const favorite = card?.favorite ?? false;
  return (
    <header className={styles.head}>
      <span className={styles.bigKanji} lang="ja">
        {kanji.id}
      </span>
      <div className={styles.headSide}>
        <div className={styles.chips}>
          <span className={styles.chip}>{levelName(kanji.level)}</span>
          <span className={styles.chip}>{kanji.strokes}획</span>
          <span className={styles.chip}>
            <span className={styles.statusDot} style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
        </div>
        <button
          type="button"
          className={`${styles.star} ${favorite ? styles.starOn : ''}`}
          aria-label={favorite ? '즐겨찾기 해제' : '즐겨찾기'}
          aria-pressed={favorite}
          onClick={() => void toggleFavorite(kanji.id)}
        >
          <StarIcon filled={favorite} />
        </button>
      </div>
    </header>
  );
}

function MyRecord({ kanji, srs }: { kanji: Kanji; srs: boolean }) {
  const card = useLive(() => db.cards.get([kanji.id, 'forward']), [kanji.id]);
  const logs = useLive(() => getKanjiLogs(kanji.id, 10), [kanji.id]);
  const [confirm, setConfirm] = useState(false);
  const touched = !!card && card.status !== 'new';
  const recent = [...(logs ?? [])].reverse();
  return (
    <section className={styles.section} aria-label="내 기록">
      <h2 className={styles.sectionTitle}>내 기록</h2>
      <div className={styles.recordRow}>
        <span className={styles.recordLabel}>최근 판정</span>
        {recent.length ? (
          <span className={styles.dots} aria-label={`최근 판정 ${recent.map((l) => RATING_LABEL[l.rating]).join(', ')}`}>
            {recent.map((l) => (
              <span key={l.id} className={`${styles.dot} ${RATING_CLASS[l.rating]}`} title={RATING_LABEL[l.rating]} />
            ))}
          </span>
        ) : (
          <span className={styles.muted}>아직 없음</span>
        )}
      </div>
      <div className={styles.recordRow}>
        <span className={styles.recordLabel}>다음 복습</span>
        <span>
          {card?.status === 'graduated'
            ? '졸업 (출제 안 함)'
            : srs && card?.due
              ? dueFormat.format(new Date(card.due))
              : srs
                ? '—'
                : '회독 방식 (간격 반복 꺼짐)'}
        </span>
      </div>
      {card && (
        <div className={styles.recordRow}>
          <span className={styles.recordLabel}>횟수</span>
          <span>
            알고있음 {card.pass_count}회 · 공부하겠음 {card.study_marks}회
          </span>
        </div>
      )}
      <Button block disabled={!touched} onClick={() => setConfirm(true)}>
        학습 상태 초기화
      </Button>
      <Sheet open={confirm} title={`${kanji.id} 학습 상태를 초기화할까요?`} onClose={() => setConfirm(false)}>
        <p className={styles.muted}>이 한자를 새 한자로 되돌립니다. 즐겨찾기와 판정 이력은 남고, 이미 완료한 장은 다시 잠기지 않습니다.</p>
        <Button
          tone="primary"
          block
          onClick={() => {
            void resetKanji(kanji.id);
            setConfirm(false);
          }}
        >
          초기화
        </Button>
        <Button block onClick={() => setConfirm(false)}>
          취소
        </Button>
      </Sheet>
    </section>
  );
}
