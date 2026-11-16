import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// 글꼴 (SPEC 5.4). 앱에 포함해 오프라인에서도 같은 모양으로 보이게 한다.
import '@fontsource/klee-one/600.css';
import '@fontsource/noto-serif-jp/600.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/600.css';
import '@fontsource/noto-serif-kr/600.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';

import './styles/tokens.css';
import './styles/global.css';

import { App } from './App';
import { loadSettings } from './settings/store';
import { loadOnboarding } from './settings/onboarding';
import { loadContent } from './content/content';

// 한자 데이터는 기다리지 않고 바로 읽기 시작한다 (화면은 ContentGate가 기다림)
void loadContent();

// 설정(테마 포함)을 먼저 읽은 뒤 그려서, 잘못된 테마로 깜박이지 않게 한다.
Promise.all([loadSettings(), loadOnboarding()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
