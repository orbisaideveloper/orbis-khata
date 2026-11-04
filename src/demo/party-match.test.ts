import {expect,it} from 'vitest';
import {identicalParty,partyMatches} from './party-match';
it('matches normalized name or phone, excludes edits and other companies',()=>{
 const old={id:'a',company:'c',name:'Sample  Trader',phone:'+91 55501 23456'};
 expect(identicalParty([old],{id:'b',company:'c',name:' sample trader ',phone:'5550123456'})).toBe(true);
 expect(partyMatches([old],{id:'b',company:'c',name:'Other',phone:'05550123456'})).toHaveLength(1);
 expect(partyMatches([old],{...old,company:'other',id:'b'})).toHaveLength(0);
 expect(partyMatches([old],old)).toHaveLength(0);
 expect(identicalParty([old],{...old,id:'b',phone:'1234567890'})).toBe(false);
 expect(partyMatches([{id:'a',name:'A',phone:''}],{id:'b',name:'B',phone:''})).toHaveLength(0);
});
it('detects duplicate list IDs in one pass without matching empty fields across companies',async()=>{
 const {duplicatePartyIds}=await import('./party-match');
 expect([...duplicatePartyIds([{id:'a',company:'c',name:'A',phone:'1234567890'},{id:'b',company:'c',name:'B',phone:'+91 1234567890'},{id:'x',company:'other',name:'A',phone:''}])].sort()).toEqual(['a','b']);
});
