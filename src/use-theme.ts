import {useEffect,useState} from 'react';
type Theme='glass'|'blue';
function readTheme():Theme{try{return localStorage.getItem('orbis.khata.theme.v1')==='blue'?'blue':'glass';}catch{return 'glass';}}
export function useTheme(){const [theme,setTheme]=useState(readTheme);useEffect(()=>{const update=()=>setTheme(readTheme());window.addEventListener('khata-theme',update);return()=>window.removeEventListener('khata-theme',update);},[]);return theme;}
