import AsyncStorage from "@react-native-async-storage/async-storage";
import {SOURCES} from "./sources";
export type News={id:string;source:string;title:string;text:string;url:string;date:string;kind:string;category:string;verification?:string};
const KEY="km_news_v1", STATE="km_states_v1", PREF="km_sources_v1";
const clean=(v:string)=>v.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
const relevant=(v:string)=>/костром|буй\b|шарья|волгоречен|галич|нейск|антропов|макарьев|мантуров|солигалич|чухлом|судислав|кологрив|павин|поназырев|кады/i.test(v);
const category=(v:string)=>/бпла|беспилот|дрон|пво|сбит|ракет|воздушн.{0,20}опасност|малоразмерн.{0,20}шар|аэростат/i.test(v)?"БПЛА / ракеты / тревоги":/пожар|авари|дтп|происшеств|взрыв|обломк|падени/i.test(v)?"Происшествия":"Другие новости";
const hash=(v:string)=>{let h=0;for(let i=0;i<v.length;i++)h=(Math.imul(31,h)+v.charCodeAt(i))|0;return String(h);};
async function getPrefs(){try{return JSON.parse((await AsyncStorage.getItem(PREF))||"{}")}catch{return {}}}
export async function sourcePrefs(){return getPrefs()}
export async function setSource(id:string,on:boolean){const p=await getPrefs();p[id]=on;await AsyncStorage.setItem(PREF,JSON.stringify(p))}
export async function getNews():Promise<News[]>{try{return JSON.parse((await AsyncStorage.getItem(KEY))||"[]")}catch{return []}}
export async function getStates():Promise<any[]>{try{return JSON.parse((await AsyncStorage.getItem(STATE))||"[]")}catch{return []}}
const absolute=(href:string,base:string)=>{try{return new URL(href,base).toString()}catch{return ""}};
function parseDate(v:string,fallback:string){const d=new Date(v);return Number.isNaN(d.getTime())?fallback:d.toISOString()}
function parseTelegram(html:string,sid:string,name:string,url:string,group:string,checked:string):News[]{
 const out:News[]=[];const chunks=html.split('class="tgme_widget_message_wrap');
 for(const b of chunks.slice(1,60)){
  const post=b.match(/data-post="([^"]+)"/)?.[1],raw=b.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if(!post||!raw)continue;const txt=clean(raw);if(!txt||((sid==="lpralarm"||sid==="vrv_radar"||sid==="locatorru")&&!relevant(txt)))continue;
  const dt=b.match(/<time[^>]*datetime="([^"]+)"/)?.[1]||checked;
  out.push({id:hash(sid+post),source:name,title:txt.slice(0,180),text:txt,url:"https://t.me/"+post,date:parseDate(dt,checked),kind:group,category:category(txt),verification:group==="Официальные"?"Официальный источник":"Неофициальное сообщение"});
 }
 return out;
}
function parseRss(xml:string,sid:string,name:string,url:string,group:string,checked:string):News[]{
 const out:News[]=[];const blocks=xml.match(/<(item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)||[];
 for(const b of blocks.slice(0,60)){
  const title=clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
  const link=clean((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]||(b.match(/<link[^>]*href=["']([^"']+)["']/i)||[])[1]||"");
  const body=clean((b.match(/<(description|summary|content:encoded)[^>]*>([\s\S]*?)<\/(?:description|summary|content:encoded)>/i)||[])[2]||"");
  if(!title||!link)continue;
  const rawDate=(b.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i)||[])[2]||checked;
  const target=absolute(link,url);if(!target)continue;
  out.push({id:hash(sid+target),source:name,title,text:body||title,url:target,date:parseDate(clean(rawDate),checked),kind:group,category:category(title+" "+body),verification:group==="Официальные"?"Официальный источник":"СМИ"});
 }
 return out;
}
function parseHtml(html:string,sid:string,name:string,url:string,group:string,checked:string):News[]{
 const out:News[]=[];const seen=new Set<string>();
 const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
 while((m=re.exec(html))&&out.length<45){
  const href=absolute(m[1],url),title=clean(m[2]);
  if(!href||!title||title.length<24||title.length>240||seen.has(href))continue;
  if(!href.startsWith("https://")||href===url||/javascript:|mailto:|tel:|login|search|privacy|cookie|subscribe|advert|#/.test(href))continue;
  if(title.length<24)continue;
  if(new URL(href).hostname!==new URL(url).hostname)continue;
  seen.add(href);
  const card=html.slice(Math.max(0,m.index-450),Math.min(html.length,m.index+900));
  const time=card.match(/<time[^>]*(?:datetime=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/time>/i);
  const date=parseDate(time?.[1]||time?.[2]||checked,checked);
  out.push({id:hash(sid+href),source:name,title,text:title,url:href,date,kind:group,category:category(title),verification:group==="Официальные"?"Официальный источник":"СМИ"});
 }
 return out;
}
async function fetchOne(src:typeof SOURCES[number]){
 const [sid,name,url,group,mode]=src,checked=new Date().toISOString();
 try{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  const response=await fetch(url,{headers:{"Accept":"text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8","User-Agent":"KostromaMonitor/1.1 (+public-source-reader)"},signal:controller.signal});
  clearTimeout(timer);if(!response.ok)throw new Error("HTTP "+response.status);
  const content=await response.text();if(!content)throw new Error("Пустой ответ");
  let items:News[]=[];
  if(mode!=="html"&&url.includes("t.me/s/"))items=parseTelegram(content,sid,name,url,group,checked);
  else if(/<(?:rss|feed|rdf:RDF)/i.test(content.slice(0,1500)))items=parseRss(content,sid,name,url,group,checked);
  else items=parseHtml(content,sid,name,url,group,checked);
  return {items,state:{id:sid,status:items.length?"Получено публикаций: "+items.length:"Ответ получен, новых подходящих публикаций не найдено",checked}};
 }catch(e){return {items:[] as News[],state:{id:sid,status:"Недоступен: "+(e instanceof Error?(e.name==="AbortError"?"тайм-аут":e.message):"ошибка"),checked}}}
}
export async function refreshSources(){
 const prefs=await getPrefs(),enabled=SOURCES.filter(([sid])=>prefs[sid]!==false);
 const results:{items:News[];state:any}[]=[];
 for(let i=0;i<enabled.length;i+=4)results.push(...await Promise.all(enabled.slice(i,i+4).map(fetchOne)));
 const found=results.flatMap(x=>x.items),disabled=SOURCES.filter(([sid])=>prefs[sid]===false).map(([sid])=>({id:sid,status:"Отключён пользователем",checked:new Date().toISOString()})),states=[...results.map(x=>x.state),...disabled].sort((a,b)=>SOURCES.findIndex(x=>x[0]===a.id)-SOURCES.findIndex(x=>x[0]===b.id)),old=await getNews();
 const map=new Map<string,News>();for(const item of [...found,...old])if(!map.has(item.id))map.set(item.id,item);
 const all=[...map.values()].sort((a,b)=>+new Date(b.date)-+new Date(a.date)).slice(0,1500);
 await AsyncStorage.setItem(KEY,JSON.stringify(all));await AsyncStorage.setItem(STATE,JSON.stringify(states));await AsyncStorage.setItem("km_last",new Date().toISOString());
 return {news:all,states,added:Math.max(0,all.length-old.length)};
}
export async function searchPublic(q:string):Promise<News[]>{
 const term=encodeURIComponent(q+" Костромская область"),providers=[
  ["Google Новости","https://news.google.com/rss/search?q="+term+"&hl=ru&gl=RU&ceid=RU:ru"],
  ["Bing Новости","https://www.bing.com/news/search?q="+term+"&format=rss"]
 ] as const;
 const all:News[]=[];
 for(const [name,url] of providers){try{const r=await fetch(url);if(!r.ok)continue;all.push(...parseRss(await r.text(),name,name,url,"Поиск",new Date().toISOString()))}catch{}}
 try{const url="https://yandex.ru/search/?text="+term;const r=await fetch(url);if(r.ok){const h=await r.text(),links=h.match(/<a[^>]+href=["']https?:[^"']+["'][^>]*>[\s\S]*?<\/a>/gi)||[];for(const a of links.slice(0,35)){const title=clean(a),href=(a.match(/href=["']([^"']+)["']/)||[])[1]||"";if(title.length>35&&href&&!href.includes("yandex."))all.push({id:hash(href),source:"Яндекс",title,text:title,url:href,date:new Date().toISOString(),kind:"Поиск",category:category(title),verification:"Результат поисковой выдачи"})}}}catch{}
 return all.filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,100);
}
