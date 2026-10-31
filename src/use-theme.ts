import {useEffect,useState} from 'react';
type Theme='glass'|'blue'|'smart';
function readTheme():Theme{try{const saved=localStorage.getItem('orbis.khata.theme.v1');return saved==='blue'||saved==='smart'?saved:'glass';}catch{return 'glass';}}
export function useTheme(){const [theme,setTheme]=useState(readTheme);useEffect(()=>{const update=()=>setTheme(readTheme());window.addEventListener('khata-theme',update);return()=>window.removeEventListener('khata-theme',update);},[]);return theme;}
