import { strToU8, zipSync } from 'fflate';
export type LedgerExport = {
    name: string;
    from: string;
    to: string;
    headings: string[];
    rows: string[][];
    opening: string;
    totals: string[];
};
function xml(value: string) { return value.replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!)).split('').filter(char => { const n = char.codePointAt(0) ?? 0; return n >= 32 || n === 9 || n === 10 || n === 13; }).join(''); }
export function ledgerWorkbook(data: LedgerExport): Uint8Array {
    const rows = [[data.name], [data.from + ' — ' + data.to], ['Opening', data.opening], data.headings, ...data.rows, data.totals];
    const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows.map((row, i) => '<row r="' + (i + 1) + '">' + row.map((cell, j) => '<c r="' + String.fromCodePoint(65 + j) + (i + 1) + '" t="inlineStr"><is><t xml:space="preserve">' + xml(cell) + '</t></is></c>').join('') + '</row>').join('') + '</sheetData></worksheet>';
    return zipSync({
        '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
        '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
        'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ledger" sheetId="1" r:id="rId1"/></sheets></workbook>'),
        'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
        'xl/worksheets/sheet1.xml': strToU8(sheet),
    });
}
async function ledgerPdf(data: LedgerExport) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;background:white;';
    document.body.append(wrapper);
    try {
        const sheets: HTMLElement[] = [];
        for (let offset = 0; offset < Math.max(1, data.rows.length); offset += 26) {
            const sheet = document.createElement('section');
            sheet.style.cssText = 'width:720px;min-height:960px;padding:30px;box-sizing:border-box;background:white;color:#173e30;font:14px "Noto Sans Bengali",sans-serif;';
            const heading = document.createElement('h1');
            heading.textContent = data.name;
            sheet.append(heading);
            const dates = document.createElement('p');
            dates.textContent = data.from + ' — ' + data.to + ' · Opening ' + data.opening;
            sheet.append(dates);
            const table = document.createElement('table');
            table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;';
            for (const [i, row] of [data.headings, ...data.rows.slice(offset, offset + 26)].entries()) {
                const tr = document.createElement('tr');
                for (const value of row) {
                    const cell = document.createElement(i ? 'td' : 'th');
                    cell.textContent = value;
                    cell.style.cssText = 'border-bottom:1px solid #d6e7dc;padding:8px 3px;overflow-wrap:anywhere;font-size:11px;text-align:left;';
                    tr.append(cell);
                }
                table.append(tr);
            }
            sheet.append(table);
            if (offset + 26 >= data.rows.length) {
                const total = document.createElement('p');
                total.textContent = data.totals.join(' · ');
                sheet.append(total);
            }
            wrapper.append(sheet);
            sheets.push(sheet);
        }
        const { createBillPdf } = await import('../billing/bill-pdf');
        return await createBillPdf(sheets, data.name + '-ledger');
    }
    finally {
        wrapper.remove();
    }
}
export async function exportLedger(data: LedgerExport, kind: 'pdf' | 'xlsx' | 'share') {
    const name = data.name.replace(/[^\p{L}\p{M}\p{N}._-]/gu, '-').slice(0, 80) || 'ledger';
    const file = kind === 'xlsx' ? new File([ledgerWorkbook(data) as Uint8Array<ArrayBuffer>], name + '.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) : await ledgerPdf(data);
    if (kind === 'share' && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: data.name });
        }
        catch (error) {
            if ((error as Error).name !== 'AbortError') {
                throw error;
            }
        }
        return;
    }
    const url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
