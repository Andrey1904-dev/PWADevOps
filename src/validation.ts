import {initial,type State} from './store';
import {chapters} from './catalog';
const ids=new Set(chapters.flatMap(c=>c.missions.map(m=>m.id)));
export function validateImport(value:unknown):State {
 if(!value||typeof value!=='object')throw Error('Invalid backup');
 const s=value as State;
 if(!ids.has(s.current)||!s.progress||!Array.isArray(s.sessions)||!s.settings)throw Error('Invalid backup structure');
 for(const [id,p] of Object.entries(s.progress)){if(!ids.has(id)||!['not_started','in_progress','solved','verified'].includes(p.status)||['note','error','github','review'].some(k=>typeof p[k as keyof typeof p]!=='string'))throw Error('Invalid progress');}
 for(const x of s.sessions){if(!/^[0-9a-f-]{36}$/i.test(x.id)||!Number.isInteger(x.seconds)||x.seconds<0||x.seconds>86400||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||typeof x.note!=='string')throw Error('Invalid session');}
 for(const k of ['work','rest','heavy'] as const){if(!Number.isInteger(s.settings[k])||s.settings[k]<1||s.settings[k]>720)throw Error('Invalid duration');}
 if(s.settings.timezone)new Intl.DateTimeFormat('en',{timeZone:s.settings.timezone});
 if(s.settings.anchor&&!/^\d{4}-\d{2}-\d{2}$/.test(s.settings.anchor))throw Error('Invalid date');
 return {...initial,...s,active:null,queue:[],version:0};
}
