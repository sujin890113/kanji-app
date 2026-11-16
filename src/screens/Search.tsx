import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ScreenShell } from '../components/ScreenShell';
import { ContentGate } from '../components/ContentGate';
import { STATUS_COLOR, STATUS_LABEL } from '../components/status';
import { hunumText } from '../components/KanjiSections';
import { levelName, type Content, type Kanji } from '../content/content';
import { searchKanji, type SearchHit } from '../domain/search';
import { getAllCards } from '../db/study';
import { useLive } from '../db/useLive';
import styles from './Search.module.css';

/** S9 검색 (탭 숨김) : 한자, 한국 음, 한국 훈, 가나, 다른 자형을 한 창에서 찾는다 (SPEC 2.4) */
export function Search() {
  return (
    <ScreenShell title="검색" back>
      <ContentGate>{(content) => <SearchBody content={content} />}</ContentGate>
    </ScreenShell>
  );
}

const VIA_LABEL: Record<SearchHit['via'], string> = {
  kanji: '',
  alias: '다른 자형',
  eum: '음',
  hun: '훈',
  on: '음독',
  kun: '훈독',
};

function SearchBody({ content }: { content: Content }) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const cards = useLive(getAllCards);
  // 급수(N5 → N1 → 보충)·순번 순서의 전체 목록
  const items = useMemo(
    () => content.levelIds.flatMap(({ ids }) => ids.map((id) => content.byId.get(id)).filter((k): k is Kanji => !!k)),
    [content],
  );
  const hits = useMemo(() => searchKanji(items, deferred, content.meta.aliases), [items, deferred, content]);

  return (
    <div className={styles.body}>
      <input
        className={styles.input}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus
        placeholder="한자, 한국 음·훈, 가나 (예 : 첩, 붙이다, はる)"
        aria-label="검색어"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {deferred.trim() && (
        <p className={styles.count} aria-live="polite">
          {hits.length === 0 ? '찾는 한자가 없습니다' : `${hits.length}${hits.length === 100 ? '자 이상' : '자'}`}
        </p>
      )}
      <ul className={styles.list}>
        {hits.map((h) => {
          const k = content.byId.get(h.id)!;
          const status = cards?.get(k.id)?.status ?? 'new';
          return (
            <li key={k.id}>
              <Link to={`/kanji/${encodeURIComponent(k.id)}`} className={styles.row}>
                <span className={styles.kanji} lang="ja">
                  {k.id}
                </span>
                <span className={styles.main}>
                  <span className={styles.hunum}>{[k.kokuji ? '일본 고유 한자' : '', hunumText(k)].filter(Boolean).join(' · ') || '—'}</span>
                  <span className={styles.on} lang="ja">
                    {k.on.join('・')}
                  </span>
                </span>
                <span className={styles.side}>
                  <span className={styles.level}>{levelName(k.level)}</span>
                  {VIA_LABEL[h.via] && <span className={styles.via}>{VIA_LABEL[h.via]}</span>}
                </span>
                <span
                  className={styles.dot}
                  style={{ background: STATUS_COLOR[status] }}
                  role="img"
                  aria-label={STATUS_LABEL[status]}
                  title={STATUS_LABEL[status]}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
