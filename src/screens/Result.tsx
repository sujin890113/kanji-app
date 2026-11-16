import { ScreenShell } from '../components/ScreenShell';
import { Placeholder } from '../components/Placeholder';

/** S4 세션 결과 (탭 숨김) */
export function Result() {
  return (
    <ScreenShell title="세션 결과" back>
      <Placeholder code="S4 세션 결과" milestone="M2" />
    </ScreenShell>
  );
}
