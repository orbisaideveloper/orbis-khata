import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AccountingPolicy} from './AccountingPolicy';
import {accountingPolicyCopy,policyCopy} from './copy';
afterEach(cleanup);
it.each(['en','bn','hi'])('keeps all accounting policy sections localized and accessible in %s',language=>{
 const back=vi.fn(),t=accountingPolicyCopy(language);render(<AccountingPolicy language={language} onBack={back}/>);
 expect(screen.getByRole('heading',{name:t.title})).toBeVisible();expect(document.querySelectorAll('details')).toHaveLength(6);
 fireEvent.click(screen.getByText(t.stockTitle));fireEvent.click(screen.getByRole('button',{name:new RegExp(t.back)}));expect(back).toHaveBeenCalledOnce();
 expect(Object.keys(policyCopy[language])).toEqual(Object.keys(policyCopy.en));
});
it('uses a readable fallback for a future language until its translation is added',()=>{expect(accountingPolicyCopy('future')).toEqual(policyCopy.en);});
