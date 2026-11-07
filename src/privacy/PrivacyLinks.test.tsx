import {render, screen, fireEvent} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {PrivacyLinks} from './PrivacyLinks';
it.each(['bn','en','hi'] as const)('provides safe public resources and detailed request instructions in %s',language=>{
 const view=render(<PrivacyLinks language={language} detailed/>);
 const links=screen.getAllByRole('link');expect(links).toHaveLength(3);
 expect(links[0]).toHaveAttribute('href','https://orbis-khata.onrender.com/privacy.html');
 expect(links[1]).toHaveAttribute('href','https://orbis-khata.onrender.com/delete-account.html');
 expect(links[0]).toHaveAttribute('rel','noopener noreferrer');
 const mail=links[2].getAttribute('href')!;expect(mail).toMatch(/^mailto:orbisaideveloper@gmail.com/);
 expect(decodeURIComponent(mail)).toContain('associated personal and owned business data');
 expect(view.container.querySelector('form,input,iframe')).toBeNull();view.unmount();
});
it('compact links do not expose a request action',()=>{const v=render(<PrivacyLinks language="en"/>);expect(screen.getAllByRole('link')).toHaveLength(2);v.unmount();});
it('composing a request does not invoke data deletion or transmit local secrets',()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');localStorage.setItem('privacy-secret','private-value');
 const v=render(<PrivacyLinks language="en" detailed/>);const link=screen.getByRole('link',{name:'Compose deletion request'});
 link.addEventListener('click',e=>e.preventDefault());fireEvent.click(link);
 expect(fetcher).not.toHaveBeenCalled();expect(localStorage.getItem('privacy-secret')).toBe('private-value');
 expect(link.getAttribute('href')).not.toContain('private-value');localStorage.removeItem('privacy-secret');fetcher.mockRestore();v.unmount();
});
