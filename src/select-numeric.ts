import type {SyntheticEvent} from 'react';
/** A tap replaces an existing numeric value, including prefilled zeros. */
export function selectNumeric(event:SyntheticEvent<HTMLElement>){const input=event.target;if(input instanceof HTMLInputElement&&['decimal','numeric'].includes(input.inputMode)){input.select();}}
