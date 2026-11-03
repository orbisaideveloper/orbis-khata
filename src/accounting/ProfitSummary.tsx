import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {useTutorial} from '../tutorial';
import {displayQuantity} from '../inventory/model';
import {money} from './model';
import type {businessReport} from './business-report';
type Result=ReturnType<typeof businessReport>;
export function ProfitSummary({result,language,productionEnabled}:Readonly<{result:Result;language:Language;productionEnabled:boolean|null}>){
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en),tutorial=useTutorial();
 const incomplete=l('অসম্পূর্ণ','अपूर्ण','Incomplete'),production=result.production;
 const basis=productionEnabled?l('Production চালু · Input থেকে Output-এর cost','Production चालू · Input से Output की लागत','Production ON · Input-to-output cost'):l('স্বাভাবিক হিসাব · ক্রয় ও সংরক্ষিত stock cost','सामान्य हिसाब · खरीद और सुरक्षित स्टॉक लागत','Normal accounts · Purchase and saved stock costs');
 return <section className="profit-report" aria-label={l('লাভ / লোকসান','लाभ / हानि','Profit / loss')}>
  <h3>{l('লাভ / লোকসান','लाभ / हानि','Profit / loss')}</h3>
  <p className="profit-basis">{productionEnabled===null?l('Production সেটিং যাচাই হয়নি; সংরক্ষিত stock-এর cost অনুযায়ী হিসাব।','Production सेटिंग जाँची नहीं गई; सुरक्षित स्टॉक लागत से हिसाब।','Production setting unavailable; calculations use saved stock costs.'):basis}</p>
  <dl className="profit-lines">
   <div><dt>{l('বিক্রয়','बिक्री','Sales')}</dt><dd>{money(result.sales)}</dd></div>
   <div><dt>{l('বিক্রি হওয়া মালের খরচ','बेचे माल की लागत','Cost of goods sold')}</dt><dd>{money(result.cost)}</dd></div>
   <div><dt>{l('অন্যান্য পরিশোধিত খরচ','अन्य चुकाए खर्च','Other paid expenses')}</dt><dd>{money(result.expense)}</dd></div>
   <div className="profit-total"><dt><span>{l('নিট লাভ / লোকসান','शुद्ध लाभ / हानि','Net profit / loss')}</span>{!result.complete&&<small>{l('অস্থায়ী · জানা খরচ অনুযায়ী','अस्थायी · ज्ञात लागत के अनुसार','Provisional · known costs only')}</small>}</dt><dd className={result.profit<0n?'negative':''}>{money(result.profit)}</dd></div>
  </dl>
  {!result.complete&&<output className="report-warning">{l('এটি চূড়ান্ত লাভ নয়। এই আইটেমের অজানা খরচ এখনও বাদ যায়নি:','यह अंतिम लाभ नहीं है। इन वस्तुओं की अज्ञात लागत अभी नहीं घटी है:','This is not final profit. Unknown costs have not yet been deducted for:')} {result.missing.join(', ')}{result.uncosted>0&&' '+l('আইটেম ছাড়া বিক্রয় বিল:','बिना वस्तु बिक्री बिल:','Sales without item costs:')+' '+result.uncosted}<small>{l('বিক্রয় বন্ধ করতে হবে না। আসল purchase, opening stock বা production input/output মিলিয়ে update করুন; report আবার হিসাব করবে। শুধু profit মেলাতে কাল্পনিক entry দেবেন না।','बिक्री रोकना जरूरी नहीं। वास्तविक खरीद, शुरुआती स्टॉक या उत्पादन input/output मिलाकर अपडेट करें; रिपोर्ट फिर गणना करेगी।','Sales can continue. Check and update the actual purchases, opening stock or production inputs/outputs; the report recalculates. Do not add fictitious entries just to match profit.')}</small></output>}
  <details className="profit-inventory"><summary>{l('অবশিষ্ট stock · Inventory asset','बचा स्टॉक · Inventory asset','Closing stock · Inventory asset')} <strong>{money(result.stockValue+result.workInProgress)}</strong>{!result.stockComplete&&<small>{l(' · জানা value; যাচাই বাকি',' · ज्ञात मूल्य; जाँच बाकी',' · known value; review needed')}</small>}</summary>
   <p>{l('অব্যবহৃত ও অবিক্রীত stock-এর মূল্য। এটি বিক্রির খরচ হিসেবে আবার বাদ যায় না।','अप्रयुक्त और बिना बिके स्टॉक का मूल्य। यह बिक्री लागत से दोबारा नहीं घटता।','Value of unused and unsold stock. It is not deducted again as a sales cost.')}</p>
   {result.closingStock.map(row=><div className="profit-stock-row" key={row.id}><span>{row.name}</span><span className={BigInt(row.quantity)<0n?'negative':''}>{displayQuantity(row.quantity)} {row.unit}</span><strong>{money(row.value)}</strong>{!row.complete&&<small>{l('Stock/cost মিলিয়ে নিন','स्टॉक/लागत जाँचें','Check stock/cost')}</small>}</div>)}
   {result.workInProgress>0n&&<p>{l('উৎপাদন চলছে · ব্যবহৃত input, output এখনও নেই','उत्पादन जारी · input इस्तेमाल हुआ, output बाकी','Work in progress · consumed inputs awaiting output')}: {money(result.workInProgress)}</p>}
  </details>
  {result.closingStock.some(row=>BigInt(row.quantity)<0n)&&<p className="report-warning">{l('মাইনাস stock:','ऋणात्मक स्टॉक:','Negative stock:')} {result.closingStock.filter(row=>BigInt(row.quantity)<0n).map(row=>row.name+' '+displayQuantity(row.quantity)+' '+row.unit).join(', ')}</p>}
  <section className="profit-simple" aria-label={l('সরল ক্রয়–বিক্রয় তুলনা','सरल खरीद-बिक्री तुलना','Simple purchase/sales comparison')}>
   <h4>{l('সরল ক্রয়–বিক্রয় তুলনা','सरल खरीद-बिक्री तुलना','Simple purchase/sales comparison')}</h4>
   <div className="report-secondary"><span>{l('বিক্রয় − ক্রয় − খরচ','बिक्री − खरीद − खर्च','Sales − purchases − expenses')}</span><strong className={result.tradeSurplus<0n?'negative':''}>{money(result.tradeSurplus)}</strong><span>{l('নগদ/ব্যাংকের আসা − দেওয়া','नकद/बैंक प्राप्त − भुगतान','Cash/bank in − out')}</span><strong>{money(result.cashChange)}</strong></div>
   <p>{l('এই তুলনায় সব ক্রয় ধরা আছে; অবিক্রীত stock থাকলে নিট লাভ আলাদা হবে। টাকা আসা–যাওয়াও লাভের থেকে আলাদা।','इस तुलना में सभी खरीद हैं; बचा स्टॉक होने पर शुद्ध लाभ अलग होगा। नकद का आना-जाना भी लाभ से अलग है।','This comparison includes all purchases. Unsold stock makes it differ from net profit; cash movement is separate too.')}</p>
  </section>
  {productionEnabled&&<section className="profit-production" aria-label={l('উৎপাদনের cost','उत्पादन लागत','Production cost')}>
   <h4>{l('উৎপাদনের cost','उत्पादन लागत','Production cost')}{production.product&&' · '+production.product}</h4>
   <p>{l('এই তারিখ পর্যন্ত মোট','इस तारीख तक कुल','Cumulative through')}: {production.asOf}</p>
   {production.hasHistory?<><dl className="profit-lines"><div><dt>{l('ব্যবহৃত Input-এর cost','इस्तेमाल Input की लागत','Consumed input cost')}</dt><dd>{production.complete?money(production.inputCost):incomplete}</dd></div><div><dt>{l('তৈরি Output','बना Output','Produced output')}</dt><dd>{displayQuantity(production.outputQuantity)} {production.unit}</dd></div><div><dt>{l('প্রতি ইউনিটের cost','प्रति इकाई लागत','Cost per unit')}</dt><dd>{production.complete&&production.unitCost!==null?money(production.unitCost):incomplete}</dd></div></dl><p>{l('Input-এর cost-ই Output-এ যায়। এই cost নিট লাভ থেকে একবারই বাদ হয়।','Input लागत ही Output में जाती है। शुद्ध लाभ से यह लागत केवल एक बार घटती है।','Input cost becomes output cost. It is deducted once as the output is sold.')}</p></>:<p>{l('এই তারিখ পর্যন্ত Production Input/Output নেই।','इस तारीख तक Production Input/Output नहीं है।','No production inputs/outputs recorded through this date.')}</p>}
  </section>}
  {tutorial&&<p>{l('লাভে বাকি বিক্রয়ও ধরা হয়; পেমেন্ট লাভ নয়। Production বন্ধ করলেও পুরোনো উৎপাদিত stock-এর সংরক্ষিত cost থাকে।','लाभ में उधार बिक्री भी है; भुगतान लाभ नहीं है। Production बंद करने पर भी पुराने बने स्टॉक की लागत सुरक्षित रहती है।','Profit includes credit sales, not collections. Turning Production off preserves historical production stock costs.')}</p>}
 </section>;
}
