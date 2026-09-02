import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/** Renders a scannable Code128 barcode for the boarding pass footer. */
export default function TicketBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    JsBarcode(svgRef.current, value, {
      format: 'CODE128',
      width: 1.4,
      height: 36,
      displayValue: false,
      margin: 0,
      lineColor: '#0d2640',
      background: 'transparent',
    });
  }, [value]);

  return (
    <svg
      ref={svgRef}
      data-testid="ticket-barcode"
      role="img"
      aria-label={value}
      className="h-[36px] w-[150px] flex-none"
    />
  );
}
