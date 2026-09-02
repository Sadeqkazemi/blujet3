import type { SearchAdvisoryResult } from '../../../types/public-site';
import type { StoredLocale } from '../../../hooks/useLocale';
import { formatToman, localeMoney } from '../../../lib/fa-format';
import { formatLocaleDate } from '../../../lib/locale-format';
import type { ResultsCopy } from './results-copy';
import { translateAdvisoryReason } from './results-copy';

type Props = {
  locale: StoredLocale;
  copy: ResultsCopy;
  aiState: 'idle' | 'loading' | 'done' | 'unavailable' | 'error';
  advisory: SearchAdvisoryResult | null;
  onAnalyze: () => void;
  onClose: () => void;
};

export default function ResultsAiRadar({ locale, copy, aiState, advisory, onAnalyze, onClose }: Props) {
  const closeLabel =
    locale === 'en'
      ? `Close ${copy.aiRadarTitle}`
      : locale === 'ar'
        ? `إغلاق ${copy.aiRadarTitle}`
        : `بستن ${copy.aiRadarTitle}`;

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '16px 26px 0' }} data-testid="ai-radar">
      <div
        style={{
          background: 'linear-gradient(120deg,#0d2640,#1668c4)',
          border: '1px solid #0d3b66',
          borderRadius: 12,
          padding: '12px 16px',
          boxShadow: '0 10px 24px -14px rgba(13,38,64,.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: '#ffffff26',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flex: 'none',
            }}
          >
            ✦
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>{copy.aiRadarTitle}</div>
            <div style={{ fontSize: 12.5, color: '#d6ece7', whiteSpace: 'nowrap' }}>{copy.aiRadarSub}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          {aiState === 'idle' && (
            <button
              type="button"
              onClick={onAnalyze}
              data-testid="ai-ask"
              style={{
                padding: '7px 13px',
                background: '#fff',
                color: '#1668c4',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {copy.aiAnalyze}
            </button>
          )}
          {aiState === 'loading' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 13, fontWeight: 600 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid #ffffff55',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              {copy.aiAnalyzing}
            </span>
          )}
          {aiState === 'done' && (
            <button
              type="button"
              onClick={onAnalyze}
              style={{
                padding: '6px 11px',
                border: '1.5px solid #ffffff66',
                color: '#fff',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {copy.aiReanalyze}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #ffffff55',
              borderRadius: 8,
              background: '#ffffff18',
              color: '#fff',
              fontSize: 20,
              lineHeight: 1,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {aiState === 'unavailable' && (
        <div data-testid="ai-unavailable" style={{ marginTop: 16, fontSize: 13, color: '#8a96a6', lineHeight: 1.7 }}>
          {copy.aiUnavailable}
        </div>
      )}
      {aiState === 'error' && (
        <div data-testid="ai-error" style={{ marginTop: 16, fontSize: 13, color: '#d64545', lineHeight: 1.7 }}>
          {copy.searchError}
        </div>
      )}
      {aiState === 'done' && advisory && (
        <div
          data-testid="ai-result"
          style={{
            marginTop: 16,
            background: '#fff',
            border: '1px solid #e0e9f5',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
          }}
        >
          {advisory.predictedPriceIrr && BigInt(advisory.predictedPriceIrr) > 0n && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#eef4fb',
                borderRadius: 10,
                padding: '11px 14px',
              }}
            >
              <span style={{ fontSize: 13, color: '#5a6678', fontWeight: 600 }}>{copy.aiPredictedLabel}</span>
              <span style={{ fontSize: 19, fontWeight: 900, color: '#1668c4' }}>
                {localeMoney(advisory.predictedPriceIrr, locale)} {copy.toman}
              </span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              flexWrap: 'wrap',
              paddingBottom: 11,
              borderBottom: '1px solid #eef1f5',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: advisory.recommendation === 'wait' ? '#fff4e8' : '#e8f5ee',
                color: advisory.recommendation === 'wait' ? '#d9730d' : '#1f8a5b',
                padding: '8px 14px',
                borderRadius: 28,
                fontSize: 14.5,
                fontWeight: 800,
              }}
            >
              ● {advisory.recommendation === 'wait' ? copy.aiWaitLabel : copy.aiBuyNowLabel}
            </span>
            {advisory.priceIncreaseProbPct != null && (
              <span style={{ fontSize: 13.5, color: '#5a6678' }}>
                {copy.aiProbLabel}{' '}
                <b style={{ color: '#d9730d' }}>{formatToman(advisory.priceIncreaseProbPct, locale)}%</b>
              </span>
            )}
            {advisory.cheapestDayLabel && (
              <span style={{ fontSize: 13.5, color: '#5a6678' }}>
                {copy.aiCheaperDayLabel}{' '}
                <b style={{ color: '#1668c4' }}>
                  {formatLocaleDate(advisory.cheapestDayLabel, locale)}
                </b>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.8 }}>
            <span style={{ color: '#1668c4', fontWeight: 800, whiteSpace: 'nowrap' }}>✓ {copy.aiBestPickLabel}</span>
            <span style={{ color: '#16202e' }}>
              {translateAdvisoryReason(
                advisory.reasonFa,
                locale,
                advisory.recommendation,
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
