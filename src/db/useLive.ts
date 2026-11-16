import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/** Dexie 조회 결과를 구독한다. DB가 바뀌면 다시 그린다. 처음에는 undefined */
export function useLive<T>(query: () => Promise<T>, deps: readonly unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: setValue,
      error: (err) => console.warn('기기 DB 조회 실패', err),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
