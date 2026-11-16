import { Link } from 'react-router';
import { ScreenShell, shellStyles } from '../components/ScreenShell';
import { Placeholder } from '../components/Placeholder';
import { SearchIcon } from '../components/icons';

/** S6 한자 격자 */
export function Grid() {
  return (
    <ScreenShell
      title="격자"
      actions={
        <Link to="/search" className={shellStyles.iconButton} aria-label="검색">
          <SearchIcon />
        </Link>
      }
    >
      <Placeholder code="S6 한자 격자" milestone="M6" />
    </ScreenShell>
  );
}
