import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PaperPreview } from './PaperPreview'
afterEach(cleanup)
it('paginates thirteen items with repeated company header and totals only on the final sheet',()=>{
 render(<PaperPreview companyName="My company" title="Sale" memo="Bill" numberLabel="No" number="S-1" dateLabel="Date" date="26-10-2026" partyName="Customer" partyDetails="9876543210" headings={['No','Item','Qty','Rate','Amount']} rows={Array.from({length:13},(_,i)=>[String(i+1),'Milk','1 litre','10','₹10'])} totals={[["Grand total","₹130"]]} note="" thanks="Thank you" signatures={['Party','Authorized']}/> )
 const pages=screen.getAllByRole('article');expect(pages).toHaveLength(2)
 expect(screen.getAllByRole('heading',{name:'My company'})).toHaveLength(2)
 expect(within(pages[0]).queryByText('Grand total')).toBeNull()
 expect(within(pages[1]).getByText('₹130')).toBeInTheDocument()
 expect(within(pages[1]).getByRole('cell',{name:'13'})).toBeInTheDocument()
 expect(screen.getByText('1 / 2')).toBeInTheDocument();expect(screen.getByText('2 / 2')).toBeInTheDocument()
})
