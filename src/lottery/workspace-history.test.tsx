import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { LotteryWorkspaceHistory } from './LotteryWorkspaceHistory'
import { lotteryFetch } from './transport'
import { parseHistoryRequest } from './workspace-history'

vi.mock('./transport', () => ({ lotteryFetch: vi.fn() }))

it('restarts a changed history snapshot without appending records from different versions', async () => {
  const fetch = vi.mocked(lotteryFetch)
  fetch.mockResolvedValueOnce(Response.json({
    entries: [{id:'old', json:'{}', offset:0, complete:true}], next:{revision:'1',ordinal:'2',offset:0},
  })).mockResolvedValueOnce(Response.json({error:{code:'LOTTERY_HISTORY_CHANGED'}},{status:422}))
    .mockResolvedValueOnce(Response.json({
      entries:[{id:'new',json:'{}',offset:0,complete:true}],next:null,
    }))
  render(<LotteryWorkspaceHistory organizationId="owned"/>)
  fireEvent.click(screen.getByText('Audit and ledger history'))
  fireEvent.change(screen.getByRole('textbox',{name:'Search history'}),{target:{value:'payment'}})
  fireEvent.click(screen.getByRole('button',{name:'Search'}))
  expect(await screen.findByText('old')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Next page'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Records changed')
  expect(fetch.mock.calls[1]?.[0]).toContain('revision=1')
  fireEvent.click(screen.getByRole('button',{name:'Retry'}))
  expect(await screen.findByText('new')).toBeInTheDocument()
  expect(screen.queryByText('old')).not.toBeInTheDocument()
  expect(fetch.mock.calls[2]?.[0]).toBe('/lottery/workspace/history?organizationId=owned&kind=audit&search=payment')
})

it('rejects incomplete cursors, invalid models and values outside the database bigint range', () => {
  const request = {organizationId:'owned',kind:'audit'}
  expect(parseHistoryRequest({...request,revision:'1',ordinal:'2',offset:'24000'}))
    .toEqual({...request,search:'',cursor:{revision:'1',ordinal:'2',offset:24000}})
  expect(parseHistoryRequest({...request,revision:'1'})).toBeNull()
  expect(parseHistoryRequest({...request,kind:'arbitrary-model'})).toBeNull()
  expect(parseHistoryRequest({...request,revision:'1',ordinal:'9223372036854775808',offset:'0'})).toBeNull()
})
