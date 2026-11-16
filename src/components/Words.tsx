/**
 * 대표 단어(F9)와 발음 버튼(F11). 학습 카드와 한자 상세가 함께 쓴다.
 */

import type { Content, Kanji } from '../content/content';
import { useWords, type Word } from '../content/lazyData';
import { speak, useJapaneseVoice } from '../audio/tts';
import { sinoKorean } from '../domain/sinoKorean';
import { useSettings } from '../settings/useSettings';
import { SpeakerIcon } from './icons';
import styles from './Words.module.css';

/** F11이 켜져 있고 일본어 음성이 있을 때만 쓸 수 있다 */
export function useCanSpeak(): boolean {
  const [settings] = useSettings();
  const voice = useJapaneseVoice();
  return settings.f11_tts && voice === 'yes';
}

/** 🔊 버튼. 읽을 수 없으면 그리지 않는다 (SPEC 6장 : 일본어 음성 없음 → 버튼 숨김) */
export function SpeakButton({ texts, label, className }: { texts: readonly string[]; label: string; className?: string }) {
  const [settings] = useSettings();
  const can = useCanSpeak();
  if (!can || texts.length === 0) return null;
  return (
    <button
      type="button"
      className={`${styles.speak} ${className ?? ''}`}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        speak(texts, settings.tts_rate);
      }}
    >
      <SpeakerIcon width={20} height={20} />
    </button>
  );
}

/**
 * 한자음을 따로 적을지. 한 글자 단어(旅 たび)는 훈독 단어라 적지 않고,
 * 뜻에 이미 한자음이 들어 있으면(휴일 → 휴일, (일본식) 여관 → 여관) 적지 않는다
 */
function showSino(text: string, sino: string | null, meaning: string | null): sino is string {
  if (!sino || [...text].length < 2) return false;
  if (!meaning) return true;
  return !meaning.split(/[,;·]/).some((m) => m.replace(/\([^)]*\)/g, '').trim() === sino);
}

function WordRow({ word, content }: { word: Word; content: Content }) {
  const sino = sinoKorean(word.text, (ch) => content.byId.get(ch)?.ko_main?.eum);
  return (
    <li className={styles.row}>
      <div className={styles.top}>
        <span className={styles.text} lang="ja">
          {word.text}
        </span>
        {word.reading !== word.text && (
          <span className={styles.reading} lang="ja">
            {word.reading}
          </span>
        )}
        <SpeakButton texts={[word.reading]} label={`${word.text} 발음 듣기`} />
      </div>
      <div className={styles.bottom}>
        {word.meaning_ko ? <span className={styles.meaning}>{word.meaning_ko}</span> : <span className={styles.muted}>뜻 준비 중</span>}
        {word.meaning_ko && !word.reviewed && (
          <span className={styles.draft} title="사전 뜻을 옮긴 번역 초안입니다. 아직 사람이 검수하지 않았습니다.">
            미검수
          </span>
        )}
        {showSino(word.text, sino, word.meaning_ko) && <span className={styles.sino}>한자음 {sino}</span>}
      </div>
    </li>
  );
}

/** 한자의 대표 단어 목록. limit개까지 */
export function WordList({ kanji, content, limit }: { kanji: Kanji; content: Content; limit: number }) {
  const words = useWords();
  if (kanji.words.length === 0) return null;
  if (!words) return <p className={styles.muted}>단어를 불러오는 중…</p>;
  const list = kanji.words
    .slice(0, limit)
    .map((id) => words.get(id))
    .filter((w): w is Word => !!w);
  if (list.length === 0) return null;
  return (
    <ul className={styles.list} aria-label="대표 단어">
      {list.map((w) => (
        <WordRow key={w.id} word={w} content={content} />
      ))}
    </ul>
  );
}
