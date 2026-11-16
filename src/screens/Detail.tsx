import { useParams } from 'react-router';
import { ScreenShell } from '../components/ScreenShell';
import { Placeholder } from '../components/Placeholder';
import { KanjiSample } from '../components/KanjiSample';

/** S5 한자 상세 (탭 숨김) */
export function Detail() {
  const { id = '' } = useParams();
  return (
    <ScreenShell title="한자 상세" back>
      <Placeholder code="S5 한자 상세" milestone="M4">
        {id && <KanjiSample kanji={id} />}
      </Placeholder>
    </ScreenShell>
  );
}
