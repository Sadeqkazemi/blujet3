import SurveyConfigPage from '../features/survey/SurveyConfigPage';
import SurveyResultsPage from '../features/survey/SurveyResultsPage';
import { useAuth } from '../hooks/useAuth';

/** The `survey` tab key backs IT's create/configure UI and CEO/
 * SENIOR_MANAGER/BOARD_CHAIR's read-only results + AI summary. */
export default function SurveyRouter() {
  const { user } = useAuth();
  if (user?.role === 'IT_MANAGER') return <SurveyConfigPage />;
  return <SurveyResultsPage />;
}
