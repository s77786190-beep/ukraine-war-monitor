export const SOURCES = [
["lpralarm","ЛПР тревоги","https://t.me/s/LPRalarm","Telegram"],
["vrv_radar","Радар ВРВ","https://t.me/s/vrv_radar","Telegram"],
["kostroma112","Кострома 112","https://t.me/s/kostroma112","Telegram"],
["kostroma_smi","Кострома СМИ","https://t.me/s/kostroma_smi","Telegram"],
["kostromachp","ЧП Кострома","https://t.me/s/kostromachp","Telegram"],
["locatorru","Локатор","https://t.me/s/locatorru","Telegram"],
["sk_sitnikov","Сергей Ситников","https://t.me/s/sk_sitnikov","Telegram"],
["k1news_tg","K1NEWS Telegram","https://t.me/s/k1news","Telegram"],
["moya_kostroma","Моя Кострома","https://t.me/s/moya_kostroma","Telegram"],
["kostroma_city","Кострома — события 44","https://t.me/s/kostroma_city","Telegram"],
["vestikostroma","Вести-Кострома","https://t.me/s/vestikostroma","Telegram"],
["kostromasoroka","Костромская сорока","https://t.me/s/Kostromasoroka","Telegram"],
["adm44","Портал органов власти","https://adm44.ru/","Официальные"],
["mchs44","МЧС Костромской области","https://44.mchs.gov.ru/","Официальные"],
["mvd44","УМВД Костромской области","https://44.мвд.рф/","Официальные"],
["proc44","Прокуратура Костромской области","https://epp.genproc.gov.ru/web/proc_44","Официальные"],
["sled44","Следственный комитет","https://kostroma.sledcom.ru/","Официальные"],
["k1news","K1NEWS","https://k1news.ru/","СМИ"],
["kostroma_today","KOSTROMA.TODAY","https://kostroma.today/","СМИ"],
["ko44","КО44","https://ko44.ru/","СМИ"],
["ria_kostroma","РИА Кострома","https://riakostroma.ru/","СМИ"],
["logos44","LOGOS","https://logos44.ru/","СМИ"],
["gtrk44","ГТРК Кострома","https://kostroma.rfn.ru/","СМИ"],
["mk_kostroma","МК в Костроме","https://kostroma.mk.ru/","СМИ"]
] as const;
export const INTERVALS=[5,10,15,20,30,45,60,180,300,720,1440];
export const LABELS:Record<number,string>={5:"5 минут",10:"10 минут",15:"15 минут",20:"20 минут",30:"30 минут",45:"45 минут",60:"1 час",180:"3 часа",300:"5 часов",720:"12 часов",1440:"24 часа"};
