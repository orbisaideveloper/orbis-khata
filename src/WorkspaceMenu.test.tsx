import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WorkspaceMenu } from './WorkspaceMenu'
import { readTutorial, saveTutorial } from './tutorial'
it('offers account and tutorial settings in all three languages',()=>{
 for(const language of ['bn','en','hi'] as const){
  const profile=vi.fn(),toggle=vi.fn(),logout=vi.fn()
  const view=render(<WorkspaceMenu language={language} signedIn tutorial={false} onTutorial={toggle} onProfile={profile} onLogout={logout}/>)
  fireEvent.click(screen.getByText('⋮'))
  fireEvent.click(screen.getByRole('checkbox'))
  expect(toggle).toHaveBeenCalledWith(true)
  fireEvent.click(view.container.querySelector('button')!)
  expect(profile).toHaveBeenCalledOnce()
  view.unmount()
 }
})
it('defaults tutorial off and remembers only the non-sensitive preference',()=>{
 localStorage.clear();expect(readTutorial()).toBe(false)
 saveTutorial(true);expect(readTutorial()).toBe(true)
 saveTutorial(false);expect(readTutorial()).toBe(false)
})
