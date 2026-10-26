import '@fontsource/noto-serif-bengali/400.css';
import '@fontsource/noto-serif-bengali/700.css';
import { useEffect, useRef, useState } from 'react';
import '../billing/paper.css';
import type { BillTemplate } from './BillDesign';
type Props = {
    template?: BillTemplate;
    companyDetails?: string;
    draft?: string;
    continuation?: string;
    companyName: string;
    title: string;
    memo: string;
    numberLabel: string;
    number: string;
    dateLabel: string;
    date: string;
    partyName: string;
    partyDetails: string;
    headings: string[];
    rows: string[][];
    totals: string[][];
    note: string;
    thanks: string;
    signatures: string[];
};
function rowUnits(row: string[]) { return Math.max(1, Math.ceil(row[1].length / 28), ...row.slice(2).map(cell => Math.ceil(cell.length / 14))); }
/** Fixed paper proportions on screen; controls remain outside the scaled document. */
export function PaperPreview(p: Readonly<Props>) {
    const host = useRef<HTMLDivElement>(null), [scale, setScale] = useState(.45);
    useEffect(() => {
        const node = host.current;
        if (!node) {
            return;
        }
        const fit = () => {
            if (node.clientWidth > 0) {
                setScale(Math.min(1, node.clientWidth / 720));
            }
        };
        fit();
        window.addEventListener('resize', fit);
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
        observer?.observe(node);
        return () => { window.removeEventListener('resize', fit); observer?.disconnect(); };
    }, []);
    const template = p.template ?? 'sample';
    const fontSizes = { sample: 46, modern: 33, classic: 30 };
    const reserve = Math.ceil(Math.max(0, p.partyDetails.length - 100) / 80) + Math.ceil((p.note.length + (p.companyDetails?.length ?? 0)) / 100) + Math.floor(p.companyName.length / 35);
    const capacity = Math.max(4, 12 - reserve);
    const paperSlots=Array.from({length:capacity},(_,index)=>index+1);
    const summaries = p.totals.length > 1 ? p.totals.slice(1) : p.totals;
    const pages: string[][][] = [];
    // Long item names consume additional row space, rather than shrinking the font.
    let page: string[][] = [], used = 0;
    for (const row of p.rows) {
        const cost = rowUnits(row);
        if (page.length && (used + cost > capacity)) {
            pages.push(page);
            page = [];
            used = 0;
        }
        page.push(row);
        used += cost;
    }
    if (page.length) {
        pages.push(page);
    }
    return <div ref={host} className="paper-preview-host">{pages.map((rows, index) => <article key={rows[0]?.[0]} className={`bill-sheet bill-template-${template}`} style={{ zoom: scale }} aria-label={`${p.memo} ${index + 1} / ${pages.length}`}>
  <header className="paper-heading"><h1 style={{ fontSize: Math.max(24, fontSizes[template] - Math.max(0, p.companyName.length - 25) * .5) }}>{p.companyName}</h1>{p.companyDetails && <p className="paper-business-details">{p.companyDetails}</p>}<p className="paper-memo-title">{p.memo} · {p.title}</p>{p.draft && <small className="paper-draft">{p.draft}</small>}</header>
  <div className="paper-meta"><span>{p.numberLabel}: <strong>{p.number}</strong></span><span>{p.dateLabel}: {p.date}</span></div>
  <address className="paper-party"><strong>{p.partyName}</strong><span>{p.partyDetails}</span></address>
  <table className="paper-items"><colgroup>{[7, 39, 18, 18, 18].map((width, i) => <col key={p.headings[i]} style={{ width: width + '%' }}/>)}</colgroup><thead><tr>{p.headings.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, i) => <td key={p.headings[i]}>{cell}</td>)}</tr>)}{paperSlots.slice(rows.reduce((sum,row)=>sum+rowUnits(row),0)).map(position=><tr className="paper-blank" key={'blank'+position}>{p.headings.map((_, j) => <td key={p.headings[j]}>&nbsp;</td>)}</tr>)}</tbody>{index === pages.length - 1 && p.totals.length > 1 && <tfoot><tr><th colSpan={2}>{p.totals[0]?.[0]}</th><td>{p.totals[0]?.[1]}</td><th>{p.totals[1]?.[0]}</th><td>{p.totals[1]?.[1]}</td></tr></tfoot>}</table>
  {index === pages.length - 1 && <><dl className="paper-totals">{summaries.map(([label, value], i) => <div key={label} className={i === summaries.length - 1 ? 'paper-grand' : ''}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{p.note && <p className="paper-note">{p.note}</p>}</>}
  {index < pages.length - 1 && p.continuation && <p className="paper-continuation">{p.continuation}</p>}
  <footer className="paper-footer"><p>{p.thanks}</p><div>{p.signatures.map(label => <span key={label}>{label}</span>)}</div><small>{index + 1} / {pages.length}</small></footer>
 </article>)}</div>;
}
