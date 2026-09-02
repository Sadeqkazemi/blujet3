import type { ReactNode } from 'react';
import { panelAlertError, panelAlertSuccess, panelAlertWarning } from './panel-theme';

type PanelAlertTone = 'error' | 'success' | 'warning';

const TONE_CLASS: Record<PanelAlertTone, string> = {
  error: panelAlertError,
  success: panelAlertSuccess,
  warning: panelAlertWarning,
};

interface PanelAlertProps {
  children: ReactNode;
  tone?: PanelAlertTone;
  className?: string;
}

export default function PanelAlert({ children, tone = 'error', className = '' }: PanelAlertProps) {
  return <p className={`mb-4 ${TONE_CLASS[tone]} ${className}`.trim()}>{children}</p>;
}
