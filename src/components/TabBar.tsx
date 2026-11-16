import { NavLink } from 'react-router';
import { GridIcon, LevelsIcon, SettingsIcon, StatsIcon, TodayIcon } from './icons';
import styles from './TabBar.module.css';

const tabs = [
  { to: '/', label: '오늘', Icon: TodayIcon, end: true },
  { to: '/levels', label: '단계', Icon: LevelsIcon, end: false },
  { to: '/grid', label: '격자', Icon: GridIcon, end: false },
  { to: '/stats', label: '통계', Icon: StatsIcon, end: false },
  { to: '/settings', label: '설정', Icon: SettingsIcon, end: false },
];

/** 하단 탭 5개 (SPEC 6장). F12가 꺼지면 통계 탭을 숨기는 처리는 M6에서 한다. */
export function TabBar() {
  return (
    <nav className={styles.bar} aria-label="주 메뉴">
      <ul className={styles.list}>
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to} className={styles.item}>
            <NavLink to={to} end={end} className={({ isActive }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)}>
              <Icon className={styles.icon} />
              <span className={styles.label}>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
