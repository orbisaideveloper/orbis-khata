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
it('closes on outside touch/pointer and Escape, while preserving inside controls and outside actions',()=>{
 const outside=vi.fn(),toggle=vi.fn();
 const view=render(<><button onClick={outside}>Outside</button><WorkspaceMenu language="en" signedIn tutorial={false} onTutorial={toggle} onProfile={()=>{}} onLogout={()=>{}}/></>);
 const menu=view.container.querySelector('details')!,summary=screen.getByLabelText('More options');
 menu.setAttribute('open','');fireEvent.pointerDown(screen.getByRole('checkbox'));expect(menu).toHaveAttribute('open');fireEvent.click(screen.getByRole('checkbox'));expect(toggle).toHaveBeenCalledWith(true);
 fireEvent.keyDown(document,{key:'Enter'});expect(menu).toHaveAttribute('open');fireEvent.pointerDown(screen.getByRole('button',{name:'Outside'}),{pointerType:'touch'});expect(menu).not.toHaveAttribute('open');fireEvent.click(screen.getByRole('button',{name:'Outside'}));expect(outside).toHaveBeenCalledOnce();
 menu.setAttribute('open','');fireEvent.keyDown(document,{key:'Escape'});expect(menu).not.toHaveAttribute('open');expect(summary).toHaveFocus();fireEvent.keyDown(document,{key:'Escape'});fireEvent.pointerDown(document.body);view.unmount();fireEvent.pointerDown(document.body);
});
it('offers production only for the enabled company and closes after navigation',()=>{
 const open=vi.fn();const props={language:'en' as const,signedIn:true,tutorial:false,onTutorial:()=>{},onProfile:()=>{},onLogout:()=>{},onBooks:open};
 const view=render(<WorkspaceMenu {...props}/>);const menu=view.container.querySelector('details')!;menu.setAttribute('open','');expect(screen.queryByRole('button',{name:'Production'})).not.toBeInTheDocument();view.rerender(<WorkspaceMenu {...props} production/>);fireEvent.click(screen.getByRole('button',{name:'Production'}));expect(open).toHaveBeenCalledWith('production');expect(menu).not.toHaveAttribute('open');view.unmount();
});
