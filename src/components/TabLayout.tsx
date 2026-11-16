import { Outlet } from 'react-router';
import { TabBar } from './TabBar';
import styles from './TabLayout.module.css';

/** 하단 탭이 있는 화면들의 공통 틀 */
export function TabLayout() {
  return (
    <div className={styles.layout}>
      <Outlet />
      <TabBar />
    </div>
  );
}
