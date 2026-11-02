import {cleanup,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {ProfitSummary} from './ProfitSummary';
import {businessReport,type ReportData} from './business-report';
import {TutorialContext} from '../tutorial';
const date='2026-10-30';
function result(){
 const data:ReportData={trade:{entries:[],parties:[],balances:{},ledger_balances:{},count:0,as_of:date},expenses:{entries:[],categories:[],bills:[],balances:{},count:0},inventory:{items:[],warehouses:[],stocks:[],documents:[],count:0}};
 return {...businessReport(data,date,date),sales:8000n,cost:4000n,expense:1000n,profit:3000n,purchases:10000n,tradeSurplus:-3000n,cashChange:-1000n};
}
afterEach(cleanup);
it('keeps purchase comparison and cash separate from costed profit with Production off',()=>{
 render(<TutorialContext.Provider value={true}><ProfitSummary result={result()} language="en" productionEnabled={false}/></TutorialContext.Provider>);
 expect(screen.getByText(/Normal accounts/)).toBeVisible();expect(screen.queryByRole('region',{name:'Production cost'})).toBeNull();
 expect(screen.getByText('Net profit / loss').closest('div')).toHaveTextContent('₹30.00');
 expect(screen.getByRole('region',{name:'Simple purchase/sales comparison'})).toHaveTextContent('−₹30.00');expect(screen.getByText(/Turning Production off preserves/)).toBeVisible();
});
it('explains cumulative input/output valuation without deducting purchases twice',()=>{
 const r=result();r.production={inputCost:4000n,outputQuantity:'4000000',unitCost:1000n,product:'Curd',unit:'kg',complete:true,hasHistory:true,asOf:date};
 render(<ProfitSummary result={r} language="en" productionEnabled={true}/>);
 const production=screen.getByRole('region',{name:'Production cost'});expect(production).toHaveTextContent('Curd');expect(production).toHaveTextContent('Cumulative through: '+date);expect(within(production).getByText('Consumed input cost').closest('div')).toHaveTextContent('₹40.00');expect(within(production).getByText('Produced output').closest('div')).toHaveTextContent('4 kg');expect(within(production).getByText('Cost per unit').closest('div')).toHaveTextContent('₹10.00');expect(production).toHaveTextContent('deducted once');
});
it('withholds final profit and unknown production costs while always exposing the simple comparison',()=>{
 const r=result();r.complete=false;r.missing=['Milk'];r.uncosted=1;r.profit=-1000n;r.tradeSurplus=100n;r.production={...r.production,hasHistory:true,complete:false,unitCost:null};
 render(<TutorialContext.Provider value={false}><ProfitSummary result={r} language="en" productionEnabled={true}/></TutorialContext.Provider>);
 expect(screen.getByText('Net profit / loss').closest('div')).toHaveTextContent('—');expect(screen.getByRole('status')).toHaveTextContent('Milk');expect(screen.getByRole('status')).toHaveTextContent('Sales without item costs: 1');expect(screen.getByRole('status')).toHaveTextContent('not net profit');expect(screen.getByRole('region',{name:'Production cost'})).toHaveTextContent('Incomplete');expect(screen.queryByText(/Profit includes credit sales/)).toBeNull();expect(screen.getByRole('region',{name:'Simple purchase/sales comparison'})).toHaveTextContent('₹1.00');
});
it('shows an empty production history and an unavailable setting explicitly',()=>{
 const {rerender}=render(<ProfitSummary result={result()} language="en" productionEnabled={true}/>);expect(screen.getByText(/No production inputs/)).toBeVisible();
 rerender(<ProfitSummary result={result()} language="en" productionEnabled={null}/>);expect(screen.getByText(/Production setting unavailable/)).toBeVisible();expect(screen.queryByRole('region',{name:'Production cost'})).toBeNull();
});
it.each(['bn','hi'] as const)('renders localized incomplete diagnostics in %s',language=>{
 const r=result();r.complete=false;r.uncosted=0;r.production={...r.production,complete:true,hasHistory:true,unitCost:null};
 render(<ProfitSummary result={r} language={language} productionEnabled={true}/>);expect(screen.getByRole('status')).toBeVisible();expect(screen.getAllByText(language==='bn'?'অসম্পূর্ণ':'अपूर्ण')).toHaveLength(2);
});
