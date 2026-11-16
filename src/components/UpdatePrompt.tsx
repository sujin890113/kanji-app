import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './UpdatePrompt.module.css';

/** 한 시간마다 새 버전을 확인한다 (앱을 오래 켜 두는 경우) */
const CHECK_EVERY = 60 * 60 * 1000;

/**
 * 설치형 웹앱의 서비스 워커 등록과 알림 (M7)
 * - 새 버전을 받으면 "새 버전이 있습니다 [새로 고침]"
 * - 처음 오프라인 준비를 마치면 한 번 알린다
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      setInterval(() => {
        // 오프라인이면 확인하지 않는다
        if (navigator.onLine) void reg.update().catch(() => undefined);
      }, CHECK_EVERY);
    },
    onRegisterError(err) {
      console.warn('오프라인 기능을 켜지 못했습니다.', err);
    },
  });

  if (needRefresh) {
    return (
      <div className={styles.bar} role="status">
        <span className={styles.text}>새 버전이 있습니다</span>
        <button type="button" className={styles.action} onClick={() => void updateServiceWorker(true)}>
          새로 고침
        </button>
        <button type="button" className={styles.close} aria-label="나중에" onClick={() => setNeedRefresh(false)}>
          ×
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className={styles.bar} role="status">
        <span className={styles.text}>이제 인터넷 없이도 쓸 수 있습니다</span>
        <button type="button" className={styles.action} onClick={() => setOfflineReady(false)}>
          확인
        </button>
      </div>
    );
  }
  return null;
}
