import { ScreenShell } from '../components/ScreenShell';
import { Placeholder } from '../components/Placeholder';

/** S9 검색 (탭 숨김) */
export function Search() {
  return (
    <ScreenShell title="검색" back>
      <Placeholder code="S9 검색" milestone="M4" />
    </ScreenShell>
  );
}
