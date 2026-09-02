import { Buffer } from 'node:buffer';

export type FinanceXlsxSaleRow = {
  bookingId: string;
  pnr: string;
  bookedAt: string;
  bookingStatus: string;
  paymentStatus: string;
  channel: string;
  flightNo: string;
  originCode: string;
  destCode: string;
  departureAt: string;
  arrivalAt: string;
  cabin: string;
  fareClassCode?: string | null;
  passengerCount: number;
  baseFareIrr: string;
  taxIrr: string;
  extrasIrr: string;
  totalIrr: string;
  agencyName?: string | null;
};

export type FinanceXlsxSummaryRow = {
  name: string;
  totalIrr: string;
  paidIrr: string;
  outstandingIrr: string;
  soldSeats: number;
};

type Cell = {
  value?: string | number | boolean | null;
  formula?: string;
  style?: number;
  type?: 'string' | 'number' | 'boolean';
};

type SheetSpec = {
  name: string;
  rows: Cell[][];
  merges?: string[];
  widths?: number[];
  freezeRow?: number;
  autoFilter?: string;
  tabColor?: string;
  rowHeights?: Record<number, number>;
};

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const xmlEscape = (
  value: string | number | boolean | bigint | null | undefined,
) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const colName = (index: number) => {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const cellRef = (row: number, column: number) => `${colName(column)}${row}`;

const numericValue = (value: string | number | bigint | null | undefined) => {
  if (value === null || value === undefined || value === '') return '0';
  return String(value);
};

const sumBigInt = (
  rows: FinanceXlsxSaleRow[],
  selector: (row: FinanceXlsxSaleRow) => string,
) => rows.reduce((sum, row) => sum + BigInt(selector(row) || '0'), 0n);

const statusStyle = (status: string) => {
  if (status === 'PAID' || status === 'TICKETED' || status === 'FLOWN')
    return 11;
  if (status === 'REFUNDED' || status === 'CANCELLED' || status === 'EXPIRED')
    return 12;
  return 13;
};

const displayDate = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString().slice(0, 16).replace('T', ' ');
};

function cellXml(cell: Cell, row: number, column: number) {
  const ref = cellRef(row, column);
  const style = cell.style === undefined ? '' : ` s="${cell.style}"`;
  if (cell.formula) {
    const cached =
      cell.value === null || cell.value === undefined
        ? ''
        : `<v>${xmlEscape(cell.value)}</v>`;
    return `<c r="${ref}"${style}><f>${xmlEscape(cell.formula)}</f>${cached}</c>`;
  }
  if (cell.value === null || cell.value === undefined || cell.value === '') {
    return `<c r="${ref}"${style}/>`;
  }
  if (cell.type === 'number')
    return `<c r="${ref}"${style}><v>${xmlEscape(cell.value)}</v></c>`;
  if (cell.type === 'boolean')
    return `<c r="${ref}"${style} t="b"><v>${cell.value ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
}

function sheetXml(spec: SheetSpec) {
  const maxColumns = Math.max(1, ...spec.rows.map((row) => row.length));
  const maxRows = Math.max(1, spec.rows.length);
  const rowsXml = spec.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => cellXml(cell, rowIndex + 1, columnIndex))
        .join('');
      const height = String(
        spec.rowHeights?.[rowIndex + 1] ??
          (rowIndex === 0 ? 28 : rowIndex === 1 ? 22 : 20),
      );
      return `<row r="${rowIndex + 1}" ht="${height}" customHeight="1">${cells}</row>`;
    })
    .join('');
  const widths = spec.widths ?? Array.from({ length: maxColumns }, () => 16);
  const colsXml = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('');
  const pane = spec.freezeRow
    ? `<pane ySplit="${spec.freezeRow}" topLeftCell="A${spec.freezeRow + 1}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="A${spec.freezeRow + 1}" sqref="A${spec.freezeRow + 1}"/>`
    : '<selection activeCell="A1" sqref="A1"/>';
  const merges = spec.merges?.length
    ? `<mergeCells count="${spec.merges.length}">${spec.merges.map((range) => `<mergeCell ref="${range}"/>`).join('')}</mergeCells>`
    : '';
  const autoFilter = spec.autoFilter
    ? `<autoFilter ref="${spec.autoFilter}"/>`
    : '';
  const tabColor = spec.tabColor
    ? `<sheetPr><tabColor rgb="FF${spec.tabColor.replace('#', '')}"/><pageSetUpPr fitToPage="1"/></sheetPr>`
    : '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
  // OOXML sequence is strict: autoFilter precedes mergeCells. Excel repairs
  // workbooks that reverse these elements even though generic ZIP/XML checks
  // still pass.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${colName(maxColumns - 1)}${maxRows}"/>${tabColor}<sheetViews><sheetView rightToLeft="1" showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${colsXml}</cols><sheetData>${rowsXml}</sheetData>${autoFilter}${merges}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0;[Red](#,##0);-"/><numFmt numFmtId="165" formatCode="#,##0.00;[Red](#,##0.00);-"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF123B70"/><name val="Aptos"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123B70"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F6BCE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F7F3"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7E0EF"/></left><right style="thin"><color rgb="FFD7E0EF"/></right><top style="thin"><color rgb="FFD7E0EF"/></top><bottom style="thin"><color rgb="FFD7E0EF"/></bottom><diagonal/></border><border><left/><right/><top style="medium"><color rgb="FF123B70"/></top><bottom style="thin"><color rgb="FF123B70"/></bottom><diagonal/></border><border><left/><right/><top/><bottom style="double"><color rgb="FF123B70"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="2" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="2" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="166" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="3" fillId="4" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="3" fillId="5" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="5" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="6" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/><colors/></styleSheet>`;
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<{ name: string; data: string | Buffer }>) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, 'utf8');
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    name.copy(header, 30);
    local.push(header, data);

    const directory = Buffer.alloc(46 + name.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0, 14);
    directory.writeUInt32LE(crc32(data), 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    name.copy(directory, 46);
    central.push(directory);
    offset += header.length + data.length;
  }
  const localBytes = Buffer.concat(local);
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localBytes, centralBytes, end]);
}

const text = (
  value: string | number | boolean | bigint | null | undefined,
  style = 5,
): Cell => ({
  value: value == null ? '' : String(value),
  style,
});
const number = (value: string | number | bigint, style = 6): Cell => ({
  value: numericValue(value),
  type: 'number',
  style,
});
const currency = (value: string | number | bigint, style = 7): Cell => ({
  value: numericValue(value),
  type: 'number',
  style,
});
const formula = (
  expression: string,
  cached: string | number | bigint,
  style = 6,
): Cell => ({
  formula: expression,
  value: numericValue(cached),
  type: 'number',
  style,
});

function titleRows(title: string, subtitle: string, columns: number): Cell[][] {
  return [
    [
      { value: title, style: 1 },
      ...Array.from({ length: columns - 1 }, () => ({ style: 1 })),
    ],
    [
      { value: subtitle, style: 2 },
      ...Array.from({ length: columns - 1 }, () => ({ style: 2 })),
    ],
  ];
}

function salesDetailSheet(rows: FinanceXlsxSaleRow[]): SheetSpec {
  const headers = [
    'Booking ID',
    'PNR',
    'Booked At',
    'Booking Status',
    'Payment Status',
    'Channel',
    'Flight',
    'Origin',
    'Destination',
    'Departure',
    'Arrival',
    'Cabin',
    'Fare Class',
    'Passengers',
    'Base Fare (IRR)',
    'Tax (IRR)',
    'Ancillary (IRR)',
    'Grand Total (IRR)',
    'Agency',
  ];
  const body = rows.map((row) => [
    text(row.bookingId),
    text(row.pnr),
    text(displayDate(row.bookedAt)),
    text(row.bookingStatus, statusStyle(row.bookingStatus)),
    text(row.paymentStatus, statusStyle(row.paymentStatus)),
    text(row.channel),
    text(row.flightNo),
    text(row.originCode),
    text(row.destCode),
    text(displayDate(row.departureAt)),
    text(displayDate(row.arrivalAt)),
    text(row.cabin),
    text(row.fareClassCode ?? ''),
    number(row.passengerCount),
    currency(row.baseFareIrr),
    currency(row.taxIrr),
    currency(row.extrasIrr),
    currency(row.totalIrr, 9),
    text(row.agencyName ?? 'فروش مستقیم'),
  ]);
  if (!body.length)
    body.push([
      text('No records for the selected filters', 13),
      ...Array.from({ length: headers.length - 1 }, () => ({ style: 13 })),
    ]);
  return {
    name: 'Sales Detail',
    rows: [
      ...titleRows(
        'Blujet — Detailed Sales Report',
        'Operational sales ledger • generated from the selected server-side filters',
        headers.length,
      ),
      [
        { value: 'Report detail', style: 3 },
        ...Array.from({ length: headers.length - 1 }, () => ({ style: 3 })),
      ],
      headers.map((header) => ({ value: header, style: 3 })),
      ...body,
    ],
    merges: ['A1:S1', 'A2:S2', 'A3:S3'],
    widths: [
      22, 14, 21, 16, 16, 14, 12, 10, 12, 21, 21, 13, 12, 11, 17, 15, 17, 18,
      24,
    ],
    freezeRow: 4,
    autoFilter: `A4:S${Math.max(4, rows.length + 4)}`,
    tabColor: '#2F6BCE',
  };
}

function summarySheet(
  rows: FinanceXlsxSaleRow[],
  summaries: FinanceXlsxSummaryRow[],
  filters: string,
): SheetSpec {
  const totalPassengers = rows.reduce(
    (sum, row) => sum + row.passengerCount,
    0,
  );
  const gross = sumBigInt(rows, (row) => row.totalIrr);
  const paid = sumBigInt(
    rows.filter((row) => row.paymentStatus === 'PAID'),
    (row) => row.totalIrr,
  );
  const refunds = sumBigInt(
    rows.filter((row) => row.paymentStatus === 'REFUNDED'),
    (row) => row.totalIrr,
  );
  const tax = sumBigInt(rows, (row) => row.taxIrr);
  const summaryGross = summaries.reduce(
    (sum, row) => sum + BigInt(row.totalIrr || '0'),
    0n,
  );
  const endRow = Math.max(6, rows.length + 5);
  const rowsOut: Cell[][] = [
    ...titleRows(
      'Blujet — Finance Reporting Pack',
      `Generated ${new Date().toISOString()} • ${filters}`,
      8,
    ),
    [
      { value: 'Executive summary', style: 3 },
      ...Array.from({ length: 7 }, () => ({ style: 3 })),
    ],
    [
      text('Metric', 3),
      text('Value', 3),
      text('Unit', 3),
      text('Control / interpretation', 3),
      ...Array.from({ length: 4 }, () => ({ style: 3 })),
    ],
    [
      text('Bookings'),
      formula(`COUNTA('Sales Detail'!A5:A${endRow})`, rows.length),
      text('orders'),
      text('Filtered booking records'),
    ],
    [
      text('Passengers'),
      formula(`SUM('Sales Detail'!N5:N${endRow})`, totalPassengers),
      text('passengers'),
      text('Seat-occupying passenger count'),
    ],
    [
      text('Gross sales'),
      formula(`SUM('Sales Detail'!R5:R${endRow})`, gross, 9),
      text('IRR'),
      text('Grand total before refund reconciliation'),
    ],
    [
      text('Paid sales'),
      formula(
        `SUMIF('Sales Detail'!E5:E${endRow},"PAID",'Sales Detail'!R5:R${endRow})`,
        paid,
        9,
      ),
      text('IRR'),
      text('Paid/TICKETED operational revenue'),
    ],
    [
      text('Refunded sales'),
      formula(
        `SUMIF('Sales Detail'!E5:E${endRow},"REFUNDED",'Sales Detail'!R5:R${endRow})`,
        refunds,
        9,
      ),
      text('IRR'),
      text('Refunded booking value'),
    ],
    [
      text('Tax collected'),
      formula(`SUM('Sales Detail'!P5:P${endRow})`, tax, 9),
      text('IRR'),
      text('Aggregate tax field from booking ledger'),
    ],
    [
      { value: 'Management breakdown', style: 3 },
      ...Array.from({ length: 7 }, () => ({ style: 3 })),
    ],
    [
      text('Partner / channel', 3),
      text('Gross sales (IRR)', 3),
      text('Paid (IRR)', 3),
      text('Outstanding (IRR)', 3),
      text('Sold seats', 3),
      text('Share of gross (%)', 3),
      text('Status', 3),
      text('Notes', 3),
    ],
    ...summaries.map((row, index) => [
      text(row.name),
      currency(row.totalIrr),
      currency(row.paidIrr),
      currency(row.outstandingIrr),
      number(row.soldSeats),
      formula(
        `IFERROR(B${13 + index}/$B$${13 + summaries.length}*100,0)`,
        summaryGross === 0n
          ? 0
          : (Number(BigInt(row.totalIrr || '0')) / Number(summaryGross)) * 100,
        6,
      ),
      text(
        BigInt(row.outstandingIrr || '0') === 0n ? 'Settled' : 'Open',
        BigInt(row.outstandingIrr || '0') === 0n ? 11 : 12,
      ),
      text('Derived from filtered sales rows'),
    ]),
    [
      text('Total', 8),
      formula(
        `SUM(B13:B${12 + summaries.length})`,
        summaries.reduce((sum, row) => sum + BigInt(row.totalIrr || '0'), 0n),
        9,
      ),
      formula(
        `SUM(C13:C${12 + summaries.length})`,
        summaries.reduce((sum, row) => sum + BigInt(row.paidIrr || '0'), 0n),
        9,
      ),
      formula(
        `SUM(D13:D${12 + summaries.length})`,
        summaries.reduce(
          (sum, row) => sum + BigInt(row.outstandingIrr || '0'),
          0n,
        ),
        9,
      ),
      formula(
        `SUM(E13:E${12 + summaries.length})`,
        summaries.reduce((sum, row) => sum + row.soldSeats, 0),
        6,
      ),
      formula('SUM(F13:F100)', summaries.length ? 100 : 0, 6),
      text('Control', 8),
      text('Totals reconcile to detail rows', 8),
    ],
    [
      { value: 'Audit note', style: 3 },
      ...Array.from({ length: 7 }, () => ({ style: 3 })),
    ],
    [
      text(
        'Tax-code, commission and VAT components are shown in the Reconciliation sheet. Components not stored separately in the booking ledger remain zero and are explicitly disclosed.',
        13,
      ),
      ...Array.from({ length: 7 }, () => ({ style: 13 })),
    ],
  ];
  return {
    name: 'Summary',
    rows: rowsOut,
    merges: [
      'A1:H1',
      'A2:H2',
      'A3:H3',
      'A11:H11',
      `A${14 + summaries.length}:H${14 + summaries.length}`,
      `A${15 + summaries.length}:H${15 + summaries.length}`,
    ],
    widths: [26, 19, 19, 21, 14, 14, 14, 38],
    freezeRow: 4,
    tabColor: '#123B70',
    rowHeights: { [15 + summaries.length]: 42 },
  };
}

function refundsSheet(rows: FinanceXlsxSaleRow[]): SheetSpec {
  const headers = [
    'PNR',
    'Booking ID',
    'Refund Status',
    'Booked At',
    'Flight',
    'Route',
    'Passengers',
    'Refunded Value (IRR)',
    'Tax (IRR)',
    'Agency',
  ];
  const refunded = rows.filter((row) => row.paymentStatus === 'REFUNDED');
  const body = refunded.map((row) => [
    text(row.pnr),
    text(row.bookingId),
    text(row.paymentStatus, 12),
    text(displayDate(row.bookedAt)),
    text(row.flightNo),
    text(`${row.originCode} → ${row.destCode}`),
    number(row.passengerCount),
    currency(row.totalIrr),
    currency(row.taxIrr),
    text(row.agencyName ?? 'فروش مستقیم'),
  ]);
  if (!body.length)
    body.push([
      text('No refunds in the selected range', 13),
      ...Array.from({ length: headers.length - 1 }, () => ({ style: 13 })),
    ]);
  return {
    name: 'Refunds',
    rows: [
      ...titleRows(
        'Blujet — Refund Register',
        'Refunded bookings and tax amounts from the filtered sales ledger',
        headers.length,
      ),
      headers.map((header) => ({ value: header, style: 3 })),
      ...body,
    ],
    merges: ['A1:J1', 'A2:J2'],
    widths: [14, 22, 16, 21, 12, 20, 12, 20, 16, 24],
    freezeRow: 3,
    autoFilter: `A3:J${Math.max(3, body.length + 3)}`,
    tabColor: '#C2413A',
  };
}

function agencySheet(rows: FinanceXlsxSaleRow[]): SheetSpec {
  const groups = new Map<string, FinanceXlsxSaleRow[]>();
  rows.forEach((row) => {
    const name =
      row.agencyName ??
      (row.channel === 'AGENCY' ? 'آژانس نامشخص' : 'فروش مستقیم');
    groups.set(name, [...(groups.get(name) ?? []), row]);
  });
  const headers = [
    'Agency / Channel',
    'Bookings',
    'Passengers',
    'Gross Sales (IRR)',
    'Paid (IRR)',
    'Refunded (IRR)',
    'Outstanding (IRR)',
    'Sold Seats',
    'Settlement Status',
  ];
  const data = [...groups.entries()].map(([name, group]) => {
    const gross = sumBigInt(group, (row) => row.totalIrr);
    const paid = sumBigInt(
      group.filter((row) => row.paymentStatus === 'PAID'),
      (row) => row.totalIrr,
    );
    const refunded = sumBigInt(
      group.filter((row) => row.paymentStatus === 'REFUNDED'),
      (row) => row.totalIrr,
    );
    const outstanding = sumBigInt(
      group.filter((row) => !['PAID', 'REFUNDED'].includes(row.paymentStatus)),
      (row) => row.totalIrr,
    );
    const passengers = group.reduce((sum, row) => sum + row.passengerCount, 0);
    return [
      text(name),
      number(group.length),
      number(passengers),
      currency(gross),
      currency(paid),
      currency(refunded),
      currency(outstanding),
      number(passengers),
      text(
        outstanding === 0n ? 'Settled' : 'Open',
        outstanding === 0n ? 11 : 12,
      ),
    ];
  });
  if (!data.length)
    data.push([
      text('No agency/channel rows in the selected range', 13),
      ...Array.from({ length: headers.length - 1 }, () => ({ style: 13 })),
    ]);
  return {
    name: 'Agency Settlement',
    rows: [
      ...titleRows(
        'Blujet — Agency Settlement',
        'Settlement-oriented channel breakdown; outstanding values reflect pending ledger bookings',
        headers.length,
      ),
      headers.map((header) => ({ value: header, style: 3 })),
      ...data,
    ],
    merges: ['A1:I1', 'A2:I2'],
    widths: [28, 12, 14, 20, 18, 18, 22, 14, 20],
    freezeRow: 3,
    autoFilter: `A3:I${Math.max(3, data.length + 3)}`,
    tabColor: '#58A77B',
  };
}

function deriveSummaries(rows: FinanceXlsxSaleRow[]): FinanceXlsxSummaryRow[] {
  const groups = new Map<string, FinanceXlsxSaleRow[]>();
  rows.forEach((row) => {
    const name =
      row.agencyName ??
      (row.channel === 'AGENCY' ? 'آژانس نامشخص' : 'فروش مستقیم');
    groups.set(name, [...(groups.get(name) ?? []), row]);
  });
  return [...groups.entries()].map(([name, group]) => {
    const total = sumBigInt(group, (row) => row.totalIrr);
    const paid = sumBigInt(
      group.filter((row) => row.paymentStatus === 'PAID'),
      (row) => row.totalIrr,
    );
    const outstanding = sumBigInt(
      group.filter((row) => !['PAID', 'REFUNDED'].includes(row.paymentStatus)),
      (row) => row.totalIrr,
    );
    return {
      name,
      totalIrr: total.toString(),
      paidIrr: paid.toString(),
      outstandingIrr: outstanding.toString(),
      soldSeats: group.reduce((sum, row) => sum + row.passengerCount, 0),
    };
  });
}

function flightSummarySheet(rows: FinanceXlsxSaleRow[]): SheetSpec {
  const groups = new Map<string, FinanceXlsxSaleRow[]>();
  rows.forEach((row) => {
    const key = `${row.flightNo}|${row.originCode}|${row.destCode}|${row.cabin}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  const headers = [
    'Flight',
    'Route',
    'Cabin',
    'Bookings',
    'Passengers',
    'Gross Sales (IRR)',
    'Paid (IRR)',
    'Refunded (IRR)',
    'Last Departure',
  ];
  const data = [...groups.entries()].map(([key, group]) => {
    const [flight, origin, dest, cabin] = key.split('|');
    return [
      text(flight),
      text(`${origin} → ${dest}`),
      text(cabin),
      number(group.length),
      number(group.reduce((sum, row) => sum + row.passengerCount, 0)),
      currency(sumBigInt(group, (row) => row.totalIrr)),
      currency(
        sumBigInt(
          group.filter((row) => row.paymentStatus === 'PAID'),
          (row) => row.totalIrr,
        ),
      ),
      currency(
        sumBigInt(
          group.filter((row) => row.paymentStatus === 'REFUNDED'),
          (row) => row.totalIrr,
        ),
      ),
      text(displayDate(group[0]?.departureAt)),
    ];
  });
  if (!data.length)
    data.push([
      text('No flight rows in the selected range', 13),
      ...Array.from({ length: headers.length - 1 }, () => ({ style: 13 })),
    ]);
  return {
    name: 'Flight Summary',
    rows: [
      ...titleRows(
        'Blujet — Flight Performance',
        'Revenue, passenger and refund roll-up by flight / route / cabin',
        headers.length,
      ),
      headers.map((header) => ({ value: header, style: 3 })),
      ...data,
    ],
    merges: ['A1:I1', 'A2:I2'],
    widths: [14, 20, 14, 12, 14, 20, 18, 20, 22],
    freezeRow: 3,
    autoFilter: `A3:I${Math.max(3, data.length + 3)}`,
    tabColor: '#7A5CC7',
  };
}

function taxSheet(rows: FinanceXlsxSaleRow[]): SheetSpec {
  const paidRows = rows.filter((row) => row.paymentStatus === 'PAID');
  const refundRows = rows.filter((row) => row.paymentStatus === 'REFUNDED');
  const headers = [
    'Component',
    'Sales Credit (IRR)',
    'Refund Debit (IRR)',
    'Source / note',
  ];
  const body = [
    [
      'Tax — aggregate',
      sumBigInt(paidRows, (row) => row.taxIrr),
      sumBigInt(refundRows, (row) => row.taxIrr),
      'Booking taxIrr field',
    ],
    ['Tax — HL', 0n, 0n, 'Not stored separately'],
    ['Tax — I6', 0n, 0n, 'Not stored separately'],
    [
      'Tax — IR',
      sumBigInt(paidRows, (row) => row.taxIrr),
      sumBigInt(refundRows, (row) => row.taxIrr),
      'Mapped to aggregate until component ledger exists',
    ],
    ['Tax — LP', 0n, 0n, 'Not stored separately'],
    ['Tax — RI', 0n, 0n, 'Not stored separately'],
    ['Tax — V0', 0n, 0n, 'Not stored separately'],
    ['Tax — YQ', 0n, 0n, 'Not stored separately'],
  ].map(([component, sales, refunds, note]) => [
    text(component),
    currency(sales as bigint),
    currency(refunds as bigint),
    text(note, 13),
  ]);
  return {
    name: 'Tax Breakdown',
    rows: [
      ...titleRows(
        'Blujet — Tax Breakdown',
        'Tax transparency and mapping disclosure for the filtered ledger',
        headers.length,
      ),
      headers.map((header) => ({ value: header, style: 3 })),
      ...body,
      [
        text('Control total', 8),
        currency(
          sumBigInt(paidRows, (row) => row.taxIrr),
          9,
        ),
        currency(
          sumBigInt(refundRows, (row) => row.taxIrr),
          9,
        ),
        text('Must reconcile to Sales Detail tax column', 8),
      ],
    ],
    merges: ['A1:D1', 'A2:D2'],
    widths: [24, 22, 22, 48],
    freezeRow: 3,
    autoFilter: `A3:D${body.length + 3}`,
    tabColor: '#D7952F',
  };
}

function reconciliationSheet(rows: FinanceXlsxSaleRow[]): SheetSpec {
  const paid = rows.filter((row) => row.paymentStatus === 'PAID');
  const refunded = rows.filter((row) => row.paymentStatus === 'REFUNDED');
  const paidFare =
    sumBigInt(paid, (row) => row.baseFareIrr) +
    sumBigInt(paid, (row) => row.extrasIrr);
  const paidTax = sumBigInt(paid, (row) => row.taxIrr);
  const refundFare =
    sumBigInt(refunded, (row) => row.baseFareIrr) +
    sumBigInt(refunded, (row) => row.extrasIrr);
  const refundTax = sumBigInt(refunded, (row) => row.taxIrr);
  const credit = paidFare + paidTax;
  const debit = refundFare + refundTax;
  const totalPaid = credit > debit ? credit - debit : 0n;
  const totalPayable = debit > credit ? debit - credit : 0n;
  const line = (
    no: number,
    code: string,
    description: string,
    debitValue = 0n,
    creditValue = 0n,
  ) => [
    number(no),
    text(code, no >= 21 ? 9 : 5),
    text(description, no >= 21 ? 9 : 5),
    currency(debitValue, no >= 21 ? 9 : 7),
    currency(creditValue, no >= 21 ? 9 : 7),
    text('IRR', no >= 21 ? 9 : 5),
  ];
  const data = [
    line(
      1,
      'Sales',
      `Total Sales for ${paid.reduce((sum, row) => sum + row.passengerCount, 0)} Tickets`,
      0n,
      paidFare,
    ),
    line(2, 'SalesTax-HL', 'Total HL Sales Tax'),
    line(3, 'SalesTax-I6', 'Total I6 Sales Tax'),
    line(4, 'SalesTax-IR', 'Total IR Sales Tax', 0n, paidTax),
    line(5, 'SalesTax-LP', 'Total LP Sales Tax'),
    line(6, 'SalesTax-RI', 'Total RI Sales Tax'),
    line(7, 'SalesTax-V0', 'Total V0 Sales Tax'),
    line(8, 'SalesTax-YQ', 'Total YQ Sales Tax'),
    line(
      9,
      'RefundFare',
      `Total Ticket Refund for ${refunded.reduce((sum, row) => sum + row.passengerCount, 0)} Tickets`,
      refundFare,
      0n,
    ),
    line(10, 'RefundTax-HL', 'Total HL Refund Tax'),
    line(11, 'RefundTax-I6', 'Total I6 Refund Tax'),
    line(12, 'RefundTax-IR', 'Total IR Refund Tax', refundTax, 0n),
    line(13, 'RefundTax-LP', 'Total LP Refund Tax'),
    line(14, 'RefundTax-RI', 'Total RI Refund Tax'),
    line(15, 'RefundTax-V0', 'Total V0 Refund Tax'),
    line(16, 'RefundTax-YQ', 'Total YQ Refund Tax'),
    line(17, 'CRCN', 'Total Agent CRCN'),
    line(18, 'SalesCommission', 'Total Sales Commission'),
    line(19, 'RefundCommission', 'Total Refund Commission'),
    line(20, 'TotalVAT', 'Total VAT'),
    line(21, 'TotalPaid', 'Total Paid', totalPaid, 0n),
    line(22, 'TotalPayable', 'Total Payable', 0n, totalPayable),
  ];
  const headers = [
    text('No', 3),
    text('Code', 3),
    text('Description', 3),
    text('Debit', 3),
    text('Credit', 3),
    text('CUR', 3),
  ];
  return {
    name: 'Reconciliation',
    rows: [
      ...titleRows(
        'Blujet — RTRD Reconciliation',
        'Two-sided debit / credit control based on the selected booking ledger',
        6,
      ),
      headers,
      ...data,
      [
        text('Control', 8),
        text('Difference', 8),
        formula(
          'SUM(D4:D25)-SUM(E4:E25)',
          debit + totalPaid - credit - totalPayable,
          9,
        ),
        text('Expected 0', 8),
        text('OK', 10),
        text('IRR', 8),
      ],
    ],
    merges: ['A1:F1', 'A2:F2'],
    widths: [8, 22, 46, 20, 20, 10],
    freezeRow: 3,
    autoFilter: 'A3:F25',
    tabColor: '#123B70',
  };
}

function dictionarySheet() {
  const rows: Cell[][] = [
    ...titleRows(
      'Blujet — Data Dictionary & Controls',
      'Definitions, source lineage and limitations for audit-ready use',
      4,
    ),
    [
      text('Field', 3),
      text('Type', 3),
      text('Definition', 3),
      text('Source / control', 3),
    ],
    ...[
      ['Booking ID', 'String', 'Immutable booking identifier', 'bookings.id'],
      ['PNR', 'String', 'Passenger name record reference', 'bookings.pnr'],
      [
        'Cabin / Fare Class',
        'Enum / String',
        'Purchased cabin and fare family',
        'bookings.cabin / fareClassCode',
      ],
      [
        'Grand Total',
        'IRR',
        'Base fare + tax + ancillary',
        'booking ledger formula',
      ],
      [
        'Payment Status',
        'Enum',
        'PAID, REFUNDED, PENDING or CANCELLED',
        'booking status mapping',
      ],
      [
        'Tax components',
        'IRR',
        'Component-level tax split',
        'Zero where not separately stored',
      ],
      [
        'Report scope',
        'Filter',
        'Date, flight, channel and status filters',
        'Server-side query',
      ],
    ].map((row) =>
      row.map((value, index) => text(value, index === 3 ? 13 : 5)),
    ),
  ];
  return {
    name: 'Data Dictionary',
    rows,
    merges: ['A1:D1', 'A2:D2'],
    widths: [24, 18, 54, 38],
    freezeRow: 3,
    autoFilter: `A3:D${rows.length}`,
    tabColor: '#6B7B94',
  };
}

export function buildFinanceXlsx(input: {
  salesRows: FinanceXlsxSaleRow[];
  summaries?: FinanceXlsxSummaryRow[];
  filters?: string;
}): Buffer {
  const salesRows = input.salesRows;
  const summaries = input.summaries?.length
    ? input.summaries
    : deriveSummaries(salesRows);
  const filters = input.filters ?? 'All filters';
  const sheets = [
    summarySheet(salesRows, summaries, filters),
    salesDetailSheet(salesRows),
    agencySheet(salesRows),
    refundsSheet(salesRows),
    taxSheet(salesRows),
    flightSummarySheet(salesRows),
    reconciliationSheet(salesRows),
    dictionarySheet(),
  ];
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr defaultThemeVersion="164011"/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>Blujet Finance Reporting Pack</dc:title><dc:creator>Blujet</dc:creator><cp:lastModifiedBy>Blujet</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: stylesXml() },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: sheetXml(sheet),
    })),
  ]);
}

export const financeXlsxContentType = XLSX_CONTENT_TYPE;
