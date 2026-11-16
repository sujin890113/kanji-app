import { ScreenShell } from '../components/ScreenShell';
import { Placeholder } from '../components/Placeholder';
import { SegmentedControl } from '../components/SegmentedControl';
import { KanjiSample } from '../components/KanjiSample';
import { displayDefs } from '../settings/definitions';
import { useSettings } from '../settings/useSettings';
import styles from './screens.module.css';

/** S8 설정. M0에서는 7.4 화면 묶음의 테마·한자 글꼴만 동작한다. 나머지는 M3. */
export function SettingsScreen() {
  const [settings, setSetting] = useSettings();

  return (
    <ScreenShell title="설정">
      <h2 className={styles.sectionTitle}>화면</h2>

      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>{displayDefs.theme.label}</span>
        <SegmentedControl
          label={displayDefs.theme.label}
          value={settings.theme}
          choices={displayDefs.theme.choices}
          onChange={(v) => setSetting('theme', v)}
        />
      </div>

      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>{displayDefs.kanji_font.label}</span>
        <SegmentedControl
          label={displayDefs.kanji_font.label}
          value={settings.kanji_font}
          choices={displayDefs.kanji_font.choices}
          onChange={(v) => setSetting('kanji_font', v)}
        />
        <KanjiSample kanji="国" koForm="國" />
        <p className={styles.note}>왼쪽은 일본 신자체, 오른쪽은 한국 정자체 견본입니다.</p>
      </div>

      <Placeholder code="S8 설정" milestone="M3">
        <p>기능 켜기·끄기, 학습 방식, 데이터, 정보 항목</p>
      </Placeholder>
    </ScreenShell>
  );
}
