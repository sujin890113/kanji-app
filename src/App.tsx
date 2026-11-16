import { createHashRouter, RouterProvider } from 'react-router';
import { TabLayout } from './components/TabLayout';
import { useApplyDisplaySettings } from './settings/useApplyDisplaySettings';
import { Today } from './screens/Today';
import { Levels } from './screens/Levels';
import { Study } from './screens/Study';
import { Result } from './screens/Result';
import { Detail } from './screens/Detail';
import { Grid } from './screens/Grid';
import { Stats } from './screens/Stats';
import { SettingsScreen } from './screens/Settings';
import { Search } from './screens/Search';

/**
 * 화면 9개 (SPEC 6장).
 * 하단 탭이 있는 화면 : S1 오늘, S2 단계, S6 격자, S7 통계, S8 설정
 * 탭을 숨기는 화면 : S3 학습 카드, S4 세션 결과, S5 한자 상세, S9 검색
 * GitHub Pages에서 새로고침해도 깨지지 않도록 주소에 #을 쓰는 방식으로 이동한다.
 */
const router = createHashRouter([
  {
    element: <TabLayout />,
    children: [
      { index: true, element: <Today /> },
      { path: 'levels', element: <Levels /> },
      { path: 'grid', element: <Grid /> },
      { path: 'stats', element: <Stats /> },
      { path: 'settings', element: <SettingsScreen /> },
    ],
  },
  { path: 'study', element: <Study /> },
  { path: 'study/:level/:chapter', element: <Study /> },
  { path: 'result', element: <Result /> },
  { path: 'kanji/:id', element: <Detail /> },
  { path: 'search', element: <Search /> },
  { path: '*', element: <Today /> },
]);

export function App() {
  useApplyDisplaySettings();
  return <RouterProvider router={router} />;
}
