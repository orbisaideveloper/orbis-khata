import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {Themes} from './theme';
import {useTheme} from './use-theme';
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
function Current(){return <output>{useTheme()}</output>;}
it('keeps the glass option and switches the whole app to blue, persisting after remount',()=>{const view=render(<><Current/><Themes language="en"/></>);expect(screen.getByRole('status')).toHaveTextContent('glass');fireEvent.click(screen.getByRole('button',{name:'Simple · blue'}));expect(screen.getByRole('status')).toHaveTextContent('blue');view.unmount();render(<><Current/><Themes language="bn"/></>);expect(screen.getByRole('status')).toHaveTextContent('blue');fireEvent.click(screen.getByRole('button',{name:'গ্লাস · সবুজ'}));expect(screen.getByRole('status')).toHaveTextContent('glass');});
it('falls back safely if device preference storage is unavailable',()=>{vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});render(<Themes language="hi"/>);expect(()=>fireEvent.click(screen.getAllByRole('button')[1])).not.toThrow();});
