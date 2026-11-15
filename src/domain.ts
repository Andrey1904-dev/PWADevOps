export function dayType(date:string,anchor:string):'work'|'rest'|null {if(!anchor)return null; const n=(Date.parse(date+'T00:00:00Z')-Date.parse(anchor+'T00:00:00Z'))/86400000; if(!Number.isFinite(n))return null;return ((n%4)+4)%4<2?'work':'rest';}
export function localParts(now:Date,tz:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const v=(k:string)=>parts.find(p=>p.type===k)?.value??'';return {date:`${v('year')}-${v('month')}-${v('day')}`,time:`${v('hour')}:${v('minute')}`,weekday:new Intl.DateTimeFormat('en',{timeZone:tz,weekday:'short'}).format(now)};}
export function quiet(time:string,start:string,end:string){return start===end?false:start<end?time>=start&&time<end:time>=start||time<end;}
export function elapsed(start:number,now:number){return Math.max(0,Math.min(86400,Math.round((now-start)/1000)));}
export type Operation={id:string;kind:'progress'|'session'|'settings';payload:Record<string,unknown>;baseVersion:number};
export function uniqueOperations(ops:Operation[]){return [...new Map(ops.map(o=>[o.id,o])).values()];}
