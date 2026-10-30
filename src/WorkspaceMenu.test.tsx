import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WorkspaceMenu } from './WorkspaceMenu'
import { readTutorial, saveTutorial, TutorialContext,TutorialNote } from './tutorial'
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
it('opens the party and item screens from the same menu and closes it',()=>{
 const open=vi.fn()
 const view=render(<WorkspaceMenu language="en" signedIn tutorial={false} onTutorial={()=>{}} onProfile={()=>{}} onLogout={()=>{}} onBooks={open}/>)
 fireEvent.click(screen.getByText('⋮'))
 fireEvent.click(screen.getByRole('button',{name:'Parties'}))
 expect(open).toHaveBeenCalledWith('parties')
 expect(view.container.querySelector('details')).not.toHaveAttribute('open')
 fireEvent.click(screen.getByText('⋮'))
 fireEvent.click(screen.getByRole('button',{name:'Items'}))
 expect(open).toHaveBeenLastCalledWith('items')
 view.unmount()
})
it('keeps language/theme content inside the settings disclosure',()=>{const view=render(<WorkspaceMenu language="en" signedIn tutorial={false} onTutorial={()=>{}} onProfile={()=>{}} onLogout={()=>{}} settings={<label>Choose language<select aria-label="Test language"><option>English</option></select></label>}/>);fireEvent.click(screen.getByText('⋮'));fireEvent.click(screen.getByText('Settings'));expect(screen.getByLabelText('Test language')).toBeInTheDocument();view.unmount();});

it("shows explanatory text only when tutorial is enabled",()=>{const view=render(<TutorialNote><p>Detailed help</p></TutorialNote>);expect(screen.queryByText("Detailed help")).toBeNull();view.rerender(<TutorialContext.Provider value><TutorialNote><p>Detailed help</p></TutorialNote></TutorialContext.Provider>);expect(screen.getByText("Detailed help")).toBeInTheDocument();view.unmount();});
