import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {OutstandingPreview} from './OutstandingPreview';
afterEach(cleanup);
it('shows outstanding then draft remaining or advance using exact minor units',()=>{const view=render(<OutstandingPreview due={10000n} amount="25.50" language="en"/>);expect(screen.getByText('Current · Outstanding: ₹100.00')).toBeVisible();expect(screen.getByText('After this entry (preview) · Outstanding: ₹74.50')).toBeVisible();view.rerender(<OutstandingPreview due={10000n} amount="125" language="en"/>);expect(screen.getByText('After this entry (preview) · Advance: ₹25.00')).toBeVisible();view.rerender(<OutstandingPreview due={10000n} amount="." language="en"/>);expect(screen.queryByText(/After this entry/)).not.toBeInTheDocument();});
it('supports local digits and three languages without treating negative due as more debt',()=>{render(<OutstandingPreview due={-1000n} amount="৫" language="bn"/>);expect(screen.getByText(/প্রিভিউ.*অগ্রিম: ₹15.00/)).toBeVisible();});
