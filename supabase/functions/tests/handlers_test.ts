import {handler as webhook} from '../telegram-webhook/index.ts';
import {handler as worker} from '../notification-worker/index.ts';
import {handler as link} from '../link-telegram/index.ts';
Deno.env.set('TELEGRAM_WEBHOOK_SECRET','test-only-webhook-secret');
Deno.env.set('NOTIFICATION_CRON_SECRET','test-only-cron-secret');
Deno.env.set('SUPABASE_URL','https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','test-only');
function assert(value:unknown){if(!value)throw Error('Assertion failed');}
const request=(body:unknown)=>new Request('https://local/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'test-only-webhook-secret'},body:JSON.stringify(body)});
Deno.test('webhook rejects missing or incorrect secret',async()=>{assert((await webhook(new Request('https://local'))).status===401);assert((await webhook(new Request('https://local',{headers:{'X-Telegram-Bot-Api-Secret-Token':'wrong'}}))).status===401);});
Deno.test('scheduler rejects unauthorized caller',async()=>assert((await worker(new Request('https://local'))).status===401));
Deno.test('link preflight succeeds without exposing secrets',async()=>{const r=await link(new Request('https://local',{method:'OPTIONS'}));assert(r.status===200);assert(!(await r.text()).includes('test-only'));});
Deno.test('webhook validates update id and private sender',async()=>{assert((await webhook(request({update_id:'wrong'}))).status===400);assert((await webhook(request({update_id:1,message:{chat:{id:42,type:'group'}}}))).status===200);assert((await webhook(request({update_id:1,message:{chat:{id:42,type:'private'},from:{id:99}}}))).status===403);});
Deno.test('duplicate bot update has no Telegram side effect',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({duplicate:true}),{status:200,headers:{'content-type':'application/json'}});};try{assert((await webhook(request({update_id:1,message:{chat:{id:42,type:'private'},from:{id:42},text:'/done'}}))).status===200);assert(calls===1);}finally{globalThis.fetch=original;}});
Deno.test('database failure returns retryable status without a false success',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({message:'temporarily unavailable'}),{status:503,headers:{'content-type':'application/json'}});try{assert((await webhook(request({update_id:2,message:{chat:{id:42,type:'private'},from:{id:42},text:'/done'}}))).status===503);}finally{globalThis.fetch=original;}});
