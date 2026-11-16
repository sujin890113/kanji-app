import { useState } from 'react';
import { ScreenShell } from '../components/ScreenShell';
import { SegmentedControl } from '../components/SegmentedControl';
import { KanjiSample } from '../components/KanjiSample';
import { ContentGate } from '../components/ContentGate';
import { Switch } from '../components/Switch';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { levelName, withChapterSize, type Content } from '../content/content';
import {
  displayDefs,
  featureDefs,
  featureDescriptions,
  settingDefs,
  studyDefs,
  subOptionDefs,
  type FeatureKey,
  type SettingKey,
  type Settings,
} from '../settings/definitions';
import { useSettings } from '../settings/useSettings';
import { useJapaneseVoice } from '../audio/tts';
import { applyChapterSize, resetAll, resetLevel } from '../db/study';
import { clearStartLevel, skippedLevels } from '../settings/onboarding';
import { BackupItem } from './BackupItem';
import styles from './Settings.module.css';

/** 아직 동작을 연결하지 않은 항목 : 해당 단계에서 연결한다 (값은 지금도 저장된다) */
const LATER: Partial<Record<SettingKey, string>> = {
};

const RESET_PHRASE = '전체 초기화';

/** S8 설정 (SPEC 7장). 모든 값은 바꾸는 즉시 저장되고 다음 카드부터 적용된다 */
export function SettingsScreen() {
  return (
    <ScreenShell title="설정">
      <ContentGate>{(content) => <SettingsBody content={content} />}</ContentGate>
    </ScreenShell>
  );
}

function SettingsBody({ content }: { content: Content }) {
  const [settings, setSetting] = useSettings();
  const voice = useJapaneseVoice();
  const [pendingSize, setPendingSize] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<number>(content.levels[0]?.level ?? 5);
  const [confirmLevel, setConfirmLevel] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const subOf = (f: FeatureKey) =>
    (Object.keys(subOptionDefs) as (keyof typeof subOptionDefs)[]).filter((k) => subOptionDefs[k].parent === f);

  const changeChapterSize = async (size: number) => {
    // 장 경계를 다시 나누고, 장 완료는 한자별 학습 상태로 다시 계산한다 (SPEC 7.3)
    await applyChapterSize(withChapterSize(content, size).chapters, skippedLevels());
    await setSetting('chapter_size', size);
    setPendingSize(null);
    setMessage(`장 크기를 ${size}자로 바꿨습니다.`);
  };

  return (
    <>
      {message && (
        <p className={styles.toast} role="status">
          {message}
        </p>
      )}

      {/* 7.1 기능 켜기·끄기 + 7.2 하위 옵션 */}
      <section className={styles.group} aria-labelledby="g-features">
        <h2 id="g-features" className={styles.groupTitle}>
          기능 켜기·끄기
        </h2>
        {(Object.keys(featureDefs) as FeatureKey[]).map((f, i) => (
          <div key={f} className={styles.item}>
            <div className={styles.row}>
              <div className={styles.text}>
                <span className={styles.label}>
                  F{i + 1} {featureDefs[f].label}
                </span>
                <span className={styles.desc}>{featureDescriptions[f]}</span>
                {LATER[f] && <span className={styles.later}>{LATER[f]}에서 동작을 연결합니다</span>}
                {f === 'f12_stats' && <span className={styles.later}>통계 탭은 M6에서 만듭니다</span>}
                {f === 'f11_tts' && voice === 'no' && (
                  <span className={styles.later}>이 기기에 일본어 음성이 없어 발음 버튼을 숨깁니다. 기기 설정에서 일본어 음성을 설치하면 쓸 수 있습니다.</span>
                )}
              </div>
              <Switch label={featureDefs[f].label} checked={settings[f]} onChange={(v) => void setSetting(f, v)} />
            </div>
            {settings[f] && subOf(f).length > 0 && (
              <div className={styles.sub}>
                {subOf(f).map((k) => (
                  <SettingControl key={k} k={k} settings={settings} onChange={setSetting} />
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* 7.3 학습 방식 */}
      <section className={styles.group} aria-labelledby="g-study">
        <h2 id="g-study" className={styles.groupTitle}>
          학습 방식
        </h2>
        {(Object.keys(studyDefs) as (keyof typeof studyDefs)[]).map((k) =>
          k === 'chapter_size' ? (
            <div key={k} className={styles.item}>
              <span className={styles.label}>{studyDefs.chapter_size.label}</span>
              <SegmentedControl
                label={studyDefs.chapter_size.label}
                value={settings.chapter_size}
                choices={studyDefs.chapter_size.choices}
                onChange={(v) => v !== settings.chapter_size && setPendingSize(v)}
              />
            </div>
          ) : (
            <div key={k} className={styles.item}>
              <SettingControl k={k} settings={settings} onChange={setSetting} />
            </div>
          ),
        )}
      </section>

      {/* 7.4 화면 */}
      <section className={styles.group} aria-labelledby="g-display">
        <h2 id="g-display" className={styles.groupTitle}>
          화면
        </h2>
        {(Object.keys(displayDefs) as (keyof typeof displayDefs)[]).map((k) => (
          <div key={k} className={styles.item}>
            <SettingControl k={k} settings={settings} onChange={setSetting} />
            {k === 'kanji_font' && (
              <>
                <KanjiSample kanji="国" koForm="國" />
                <p className={styles.desc}>왼쪽은 일본 신자체, 오른쪽은 한국 정자체 견본입니다.</p>
              </>
            )}
          </div>
        ))}
      </section>

      {/* 7.5 데이터 */}
      <section className={styles.group} aria-labelledby="g-data">
        <h2 id="g-data" className={styles.groupTitle}>
          데이터
        </h2>
        <BackupItem />
        <div className={styles.item}>
          <span className={styles.label}>급수별 초기화</span>
          <span className={styles.desc}>고른 급수의 학습 상태와 장 진행만 지웁니다. 즐겨찾기는 남습니다.</span>
          <SegmentedControl
            label="초기화할 급수"
            value={resetTarget}
            choices={content.levels.map((l) => ({ value: l.level, label: levelName(l.level) }))}
            onChange={setResetTarget}
          />
          <Button block onClick={() => setConfirmLevel(true)}>
            {levelName(resetTarget)} 초기화
          </Button>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>전체 초기화</span>
          <span className={styles.desc}>모든 학습 기록을 지웁니다. 설정은 남습니다.</span>
          <Button block onClick={() => setConfirmAll(true)}>
            전체 초기화
          </Button>
        </div>
      </section>

      {/* 7.6 정보 */}
      <section className={styles.group} aria-labelledby="g-info">
        <h2 id="g-info" className={styles.groupTitle}>
          정보
        </h2>
        <dl className={styles.info}>
          <dt>앱 버전</dt>
          <dd>{__APP_VERSION__}</dd>
          <dt>데이터 빌드</dt>
          <dd>
            {new Date(content.meta.built_at).toLocaleString('ko-KR')} · {content.meta.count.toLocaleString('ko-KR')}자
          </dd>
        </dl>
        <ul className={styles.sources}>
          {content.meta.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.attribution}
              </a>
              <span className={styles.desc}>
                {s.version} ·{' '}
                <a href={s.license_url} target="_blank" rel="noreferrer">
                  {s.license}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={pendingSize !== null} title={`장 크기를 ${pendingSize}자로 바꿀까요?`} onClose={() => setPendingSize(null)}>
        <p className={styles.sheetText}>
          장 경계를 다시 나누고 장별 회독 수를 초기화합니다. 한자별 학습 상태는 그대로이며, 장 완료와 잠금은 학습 상태로 다시
          계산합니다. 이미 학습한 한자가 들어 있는 장은 잠기지 않습니다.
        </p>
        <div className={styles.sheetActions}>
          <Button tone="primary" block onClick={() => pendingSize !== null && void changeChapterSize(pendingSize)}>
            바꾸기
          </Button>
          <Button block onClick={() => setPendingSize(null)}>
            취소
          </Button>
        </div>
      </Sheet>

      <Sheet open={confirmLevel} title={`${levelName(resetTarget)}을(를) 초기화할까요?`} onClose={() => setConfirmLevel(false)}>
        <p className={styles.sheetText}>이 급수 한자의 학습 상태와 장 진행 기록을 지웁니다. 되돌릴 수 없습니다.</p>
        <div className={styles.sheetActions}>
          <Button
            tone="primary"
            block
            onClick={async () => {
              const ids = content.levelIds.find((l) => l.level === resetTarget)?.ids ?? [];
              await resetLevel(resetTarget, ids);
              setConfirmLevel(false);
              setMessage(`${levelName(resetTarget)} 학습 상태를 초기화했습니다.`);
            }}
          >
            초기화
          </Button>
          <Button block onClick={() => setConfirmLevel(false)}>
            취소
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirmAll}
        title="모든 학습 기록을 지울까요?"
        onClose={() => {
          setConfirmAll(false);
          setPhrase('');
        }}
      >
        <p className={styles.sheetText}>
          카드 상태, 판정 이력, 세션, 일별 기록, 장 진행을 모두 지웁니다. 되돌릴 수 없습니다. 실행하려면 아래 칸에 ‘{RESET_PHRASE}’를
          입력하세요.
        </p>
        <input
          className={styles.input}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          aria-label="확인 문구"
          placeholder={RESET_PHRASE}
        />
        <div className={styles.sheetActions}>
          <Button
            tone="primary"
            block
            disabled={phrase.trim() !== RESET_PHRASE}
            onClick={async () => {
              await resetAll();
              await clearStartLevel();
              setConfirmAll(false);
              setPhrase('');
              setMessage('모든 학습 기록을 지웠습니다.');
            }}
          >
            전체 초기화
          </Button>
          <Button
            block
            onClick={() => {
              setConfirmAll(false);
              setPhrase('');
            }}
          >
            취소
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** 정의(definitions.ts)를 보고 스위치나 선택지를 그린다 */
function SettingControl<K extends SettingKey>({
  k,
  settings,
  onChange,
}: {
  k: K;
  settings: Settings;
  onChange: <T extends SettingKey>(key: T, value: Settings[T]) => Promise<void>;
}) {
  const def = settingDefs[k];
  const later = LATER[k];
  if (def.kind === 'switch') {
    return (
      <div className={styles.row}>
        <div className={styles.text}>
          <span className={styles.label}>{def.label}</span>
          {later && <span className={styles.later}>{later}에서 동작을 연결합니다</span>}
        </div>
        <Switch label={def.label} checked={settings[k] as boolean} onChange={(v) => void onChange(k, v as Settings[K])} />
      </div>
    );
  }
  return (
    <>
      <span className={styles.label}>{def.label}</span>
      {later && <span className={styles.later}>{later}에서 동작을 연결합니다</span>}
      <SegmentedControl
        label={def.label}
        value={settings[k] as unknown}
        choices={def.choices as readonly { value: unknown; label: string }[]}
        onChange={(v) => void onChange(k, v as Settings[K])}
      />
    </>
  );
}
