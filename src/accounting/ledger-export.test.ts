import {expect,it}from'vitest';
import {unzipSync,strFromU8}from'fflate';
import{ledgerWorkbook}from'./ledger-export';
it('exports a real XLSX with Bengali, all rows, totals and no formula execution',()=>{const zipped=ledgerWorkbook({name:'দুধের দোকান',from:'2026-01-01',to:'2026-10-28',headings:['Date','Bill'],rows:[['2026-10-28','=WEBSERVICE("evil")'],['<test>','₹1,000.00']],opening:'−₹100.00',totals:['Total','₹900.00']});const files=unzipSync(zipped);expect(Object.keys(files)).toContain('xl/workbook.xml');const sheet=strFromU8(files['xl/worksheets/sheet1.xml']);expect(sheet).toContain('দুধের দোকান');expect(sheet).toContain('&lt;test&gt;');expect(sheet).toContain('WEBSERVICE');expect(sheet).not.toContain('<f>');expect(sheet).toContain('₹900.00');});
