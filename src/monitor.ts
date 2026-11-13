import AsyncStorage from "@react-native-async-storage/async-storage";
import {SOURCES} from "./sources";
export type News={id:string;source:string;title:string;text:string;url:string;date:string;kind:string;category:string};
const KEY="km_news_v1", STATE="km_states_v1", PREF="km_sources_v1";
const clean=(v:string)=>v.replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
const relevant=(v:string)=>/костром|буй\b|шарья|волгоречен|галич|нейск|антропов|макарьев|мантуров|солигалич|чухлом|судислав|кологрив|павин|поназырев|кады/i.test(v);
const category=(v:string)=>/бпла|беспилот|дрон|пво|сбит|ракет|воздушн.*опасност|шар/i.test(v)?"БПЛА / ракеты / тревоги":/пожар|авари|дтп|происшеств/i.test(v)?"Происшествия":"Другие новости";
const id=(v:string)=>{let h=0;for(let i=0;i<v.length;i++)h=(Math.imul(31,h)+v.charCodeAt(i))|0;return String(h);};
async function getPrefs(){try{return JSON.parse((await AsyncStorage.getItem(PREF))||"{}")}catch{return {}}}
export async function sourcePrefs(){return getPrefs()}
export async function setSource(id:string,on:boolean){const p=await getPrefs();p[id]=on;await AsyncStorage.setItem(PREF,JSON.stringify(p))}
export async function getNews():Promise<News[]>{try{return JSON.parse((await AsyncStorage.getItem(KEY))||"[]")}catch{return []}}
export async function getStates():Promise<any[]>{try{return JSON.parse((await AsyncStorage.getItem(STATE))||"[]")}catch{return []}}
export async function refreshSources(){
 const prefs=await getPrefs(), found:News[]=[], states:any[]=[];
 for(const [sid,name,url,group] of SOURCES){
  if(prefs[sid]===false)continue;
  const checked=new Date().toISOString();
  try{
   const r=await fetch(url,{headers:{"Accept":"text/html,application/rss+xml,application/xml,*/*"}});
   if(!r.ok)throw new Error("HTTP "+r.status);
   const html=await r.text();let count=0;
   if(url.includes("t.me/s/")){
    const chunks=html.split('class="tgme_widget_message_wrap');
    for(const b of chunks.slice(1,45)){
     const post=b.match(/data-post="([^"]+)"/)?.[1], raw=b.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
     if(!post||!raw)continue;const txt=clean(raw);if(!relevant(txt))continue;
     const dt=b.match(/<time[^>]*datetime="([^"]+)"/)?.[1]||checked;
     found.push({id:id(sid+post),source:name,title:txt.slice(0,160),text:txt,url:"https://t.me/"+post,date:dt,kind:group,category:category(txt)});count++;
    }
   } else {
    const items=html.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi)||[];
    for(const b of items.slice(0,35)){
     const title=clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
     const link=(b.match(/<link[^>]*href=["']([^"']+)["']/i)||[])[1]||(b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]||"";
     const txt=clean((b.match(/<(description|summary)[^>]*>([\s\S]*?)<\/(description|summary)>/i)||[])[2]||"");
     if(!title||!link||!relevant(title+" "+txt))continue;
     const date=(b.match(/<(pubDate|published|updated)[^>]*>([\s\S]*?)<\/(pubDate|published|updated)>/i)||[])[2]||checked;
     found.push({id:id(sid+link),source:name,title,text:txt,url:link,date,kind:group,category:category(title+" "+txt)});count++;
    }
   }
   states.push({id:sid,status:count?"Найдены публикации":"Сайт ответил; RSS или подходящих публикаций не обнаружено",checked});
  }catch(e){states.push({id:sid,status:"Недоступен: "+(e instanceof Error?e.message:"ошибка"),checked})}
 }
 const old=await getNews(), all=[...found,...old].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).sort((a,b)=>+new Date(b.date)-+new Date(a.date)).slice(0,1500);
 await AsyncStorage.setItem(KEY,JSON.stringify(all));await AsyncStorage.setItem(STATE,JSON.stringify(states));await AsyncStorage.setItem("km_last",new Date().toISOString());
 return {news:all,states,added:Math.max(0,all.length-old.length)};
}
export async function searchPublic(q:string):Promise<News[]>{
 const term=encodeURIComponent(q+" Костромская область"), providers=[
  ["Google Новости","https://news.google.com/rss/search?q="+term+"&hl=ru&gl=RU&ceid=RU:ru"],
  ["Bing Новости","https://www.bing.com/news/search?q="+term+"&format=rss"]
 ] as const;
 const all:News[]=[];
 for(const [name,url] of providers){try{const r=await fetch(url);if(!r.ok)continue;const xml=await r.text();const items=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];for(const b of items.slice(0,40)){const title=clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");const link=clean((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]||"");const desc=clean((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i)||[])[1]||"");if(!title||!link)continue;all.push({id:id(name+link),source:name,title,text:desc,url:link,date:new Date().toISOString(),kind:"Поиск",category:category(title+" "+desc)})}}catch{}}
 try{const url="https://yandex.ru/search/?text="+term;const r=await fetch(url);if(r.ok){const h=await r.text();const links=h.match(/<a[^>]+href="https?:[^"]+"[^>]*>[\s\S]*?<\/a>/gi)||[];for(const a of links.slice(0,25)){const title=clean(a);const href=(a.match(/href="([^"]+)"/)||[])[1]||"";if(title.length>35&&href)all.push({id:id(href),source:"Яндекс",title,text:title,url:href,date:new Date().toISOString(),kind:"Поиск",category:category(title)})}}}catch{}
 return all.filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,100);
}
