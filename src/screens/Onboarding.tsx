import { useState, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { ContentGate } from '../components/ContentGate';
import { levelName, type Content } from '../content/content';
import { applyStartLevel } from '../db/study';
import { LEVEL_ORDER, levelsBefore } from '../domain/progress';
import { finishOnboarding } from '../settings/onboarding';
import { useSettings } from '../settings/useSettings';
import styles from './Onboarding.module.css';

/**
 * 최초 실행 (SPEC 6장 빈 상태) : 안내 3장(판정 방법, 스와이프, 옵션 위치) 뒤 시작 급수 고르기.
 * 기본은 N5 1장부터. 이미 아는 급수가 있으면 더 높은 급수부터 시작할 수 있다 (앞 급수의 장을 완료로 둔다).
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  return (
    <main className={styles.screen}>
      <ContentGate>{(content) => <Steps content={content} onDone={onDone} />}</ContentGate>
    </main>
  );
}

const SLIDES = 3;

function Steps({ content, onDone }: { content: Content; onDone: () => void }) {
  const [settings] = useSettings();
  const [step, setStep] = useState(0);
  const [start, setStart] = useState(5);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      if (start !== 5) await applyStartLevel(content.outline, start);
      await finishOnboarding(start);
    } finally {
      setBusy(false);
    }
    onDone();
  };

  // 보충(0)은 고를 수 없다 : 상용한자 급수 N5~N1만
  const levels: number[] = LEVEL_ORDER.filter((l) => l !== 0 && content.levels.some((x) => x.level === l));

  const slides: ReactNode[] = [
    <Slide key="grade" title="판정 방법" lead="카드를 보고 떠올린 뒤, 알았는지 스스로 판정합니다.">
      <ul className={styles.list}>
        <li>
          <span className={`${styles.chip} ${styles.study}`}>공부하겠음</span> 아직 모름. 이번 회독에서 다시 나옵니다.
        </li>
        {settings.f6_three_grade && (
          <li>
            <span className={`${styles.chip} ${styles.vague}`}>애매함</span> 반쯤 앎. 조금 뒤에 다시 나옵니다.
          </li>
        )}
        <li>
          <span className={`${styles.chip} ${styles.know}`}>알고있음</span> 확실히 앎. 길게 누르면 바로 졸업합니다.
        </li>
      </ul>
      <p className={styles.note}>카드를 누르면 훈음·읽기·단어가 펼쳐집니다.</p>
    </Slide>,
    <Slide key="swipe" title="스와이프" lead="버튼 대신 카드를 밀어서 판정할 수도 있습니다.">
      <div className={styles.swipe} aria-hidden="true">
        <span className={`${styles.arrow} ${styles.left} ${styles.study}`}>← 공부하겠음</span>
        {settings.f6_three_grade && <span className={`${styles.arrow} ${styles.up} ${styles.vague}`}>↑ 애매함</span>}
        <span className={styles.card} lang="ja">
          学
        </span>
        <span className={`${styles.arrow} ${styles.right} ${styles.know}`}>알고있음 →</span>
      </div>
      <ul className={styles.list}>
        <li>왼쪽으로 밀면 공부하겠음, 오른쪽은 알고있음{settings.f6_three_grade ? ', 위쪽은 애매함' : ''}입니다.</li>
        <li>판정을 잘못했으면 위쪽의 되돌리기 버튼을 누르세요.</li>
      </ul>
    </Slide>,
    <Slide key="options" title="옵션 위치" lead="기능 12개는 모두 아래 [설정] 탭에서 켜고 끕니다.">
      <ul className={styles.list}>
        <li>음훈 병기, 정자체 대조, 간격 반복, 획순, 발음 음성 같은 기능을 하나씩 켜고 끌 수 있습니다.</li>
        <li>장 크기, 출제 순서, 글꼴, 진동·효과음, 스와이프도 [설정]에서 바꿉니다.</li>
        <li>학습 기록은 이 기기에만 저장됩니다. [설정 › 데이터]에서 백업 파일로 옮길 수 있습니다.</li>
      </ul>
    </Slide>,
  ];

  if (step < SLIDES) {
    return (
      <div className={styles.body}>
        <div className={styles.top}>
          <span className={styles.count}>
            {step + 1} / {SLIDES}
          </span>
          <button type="button" className={styles.skip} onClick={() => setStep(SLIDES)}>
            건너뛰기
          </button>
        </div>
        {slides[step]}
        <div className={styles.dots} aria-hidden="true">
          {Array.from({ length: SLIDES + 1 }, (_, i) => (
            <span key={i} className={i === step ? styles.dotOn : styles.dot} />
          ))}
        </div>
        <div className={styles.actions}>
          {step > 0 && (
            <Button className={styles.prev} onClick={() => setStep(step - 1)}>
              이전
            </Button>
          )}
          <Button tone="primary" block onClick={() => setStep(step + 1)}>
            다음
          </Button>
        </div>
      </div>
    );
  }

  const chosen = content.levels.find((l) => l.level === start);
  const skippedCount = levelsBefore(start).reduce(
    (n, lv) => n + (content.levels.find((l) => l.level === lv)?.count ?? 0),
    0,
  );
  return (
    <div className={styles.body}>
      <div className={styles.top}>
        <button type="button" className={styles.skip} onClick={() => setStep(SLIDES - 1)}>
          이전
        </button>
      </div>
      <Slide title="어디서 시작할까요?" lead="처음이라면 N5 1장부터. 이미 아는 급수가 있으면 그다음 급수를 고르세요.">
        <div className={styles.levels} role="radiogroup" aria-label="시작 급수">
          {levels.map((lv) => {
            const info = content.levels.find((l) => l.level === lv);
            return (
              <button
                key={lv}
                type="button"
                role="radio"
                aria-checked={start === lv}
                className={start === lv ? styles.levelOn : styles.level}
                onClick={() => setStart(lv)}
              >
                <span className={styles.levelName}>{levelName(lv)}</span>
                <span className={styles.levelCount}>{info?.count.toLocaleString('ko-KR')}자</span>
              </button>
            );
          })}
        </div>
        <p className={styles.note}>
          {start === 5
            ? `N5 1장(${chosen?.chapters[0]?.ids.length ?? 0}자)부터 시작합니다.`
            : `앞 급수 ${skippedCount.toLocaleString('ko-KR')}자는 건너뛴 것으로 표시해 열어 둡니다. 학습 기록은 바뀌지 않으며, 나중에 언제든 돌아가 학습할 수 있습니다.`}
        </p>
      </Slide>
      <div className={styles.actions}>
        <Button tone="primary" block disabled={busy} onClick={() => void finish()}>
          {levelName(start)} 1장부터 시작
        </Button>
      </div>
    </div>
  );
}

function Slide({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className={styles.slide} aria-label={title}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>{lead}</p>
      {children}
    </section>
  );
}
