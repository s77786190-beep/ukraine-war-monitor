import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

const C = { bg: "#080808", panel: "#141414", panel2: "#1C1C1C", orange: "#FF861A", text: "#F4F4F4", muted: "#9A9A9A", line: "#303030", red: "#FF625C" };
type Tab = "Чат" | "Задачи" | "Агенты" | "Память" | "Настройки";
type Message = { id: string; role: "user" | "assistant"; text: string; time: string };
const now = () => new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export default function App() {
  const [tab, setTab] = useState<Tab>("Чат");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [memory, setMemory] = useState("Пока нет сохранённых фактов.");
  useEffect(() => { (async () => {
    const [m, e, mem, token] = await Promise.all([AsyncStorage.getItem("chat"), AsyncStorage.getItem("endpoint"), AsyncStorage.getItem("memory"), AsyncStorage.getItem("apiToken")]);
    if (m) setMessages(JSON.parse(m)); else setMessages([{ id: "welcome", role: "assistant", text: "Я — ваш личный ИИ-агент. Интерфейс готов к подключению серверного ядра. Сейчас автономный ИИ-ответчик ещё не подключён: я не буду изображать, будто запрос уже обработан.", time: now() }]);
    if (e) setEndpoint(e); if (mem) setMemory(mem); if (token) setApiToken(token);
  })().catch(() => Alert.alert("Ошибка", "Не удалось загрузить локальные данные.")); }, []);
  const persist = async (next: Message[]) => { setMessages(next); await AsyncStorage.setItem("chat", JSON.stringify(next)); };
  const send = async () => {
    const text = draft.trim(); if (!text || busy) return;
    const user: Message = { id: String(Date.now()), role: "user", text, time: now() };
    const next = [...messages, user]; await persist(next); setDraft("");
    if (!endpoint.trim()) {
      await persist([...next, { id: String(Date.now() + 1), role: "assistant", text: "Сообщение сохранено на телефоне. Сервер агента не настроен, поэтому запрос не выполнен.", time: now() }]);
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(endpoint.replace(/\/$/, "") + "/v1/chat", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiToken }, signal: controller.signal, body: JSON.stringify({ message: text, language: "ru", memory, history: messages.slice(-20).map(({ role, text }) => ({ role, text })) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "HTTP " + response.status);
      const answer = typeof data.reply === "string" ? data.reply : "Сервер вернул ответ в неизвестном формате.";
      await persist([...next, { id: String(Date.now() + 2), role: "assistant", text: answer, time: now() }]);
    } catch (e) {
      await persist([...next, { id: String(Date.now() + 3), role: "assistant", text: "Не удалось связаться с сервером: " + String(e) + ". Сообщение сохранено локально.", time: now() }]);
    } finally { clearTimeout(requestTimeout); setBusy(false); }
  };
  const saveEndpoint = async () => { const url = endpoint.trim().replace(/\/$/, ""); await Promise.all([AsyncStorage.setItem("endpoint", url), AsyncStorage.setItem("apiToken", apiToken.trim())]); setEndpoint(url); setConnected(false); if (!url) { Alert.alert("Адрес не указан", "Введите HTTPS-адрес backend."); return; } try { const r = await fetch(url + "/health"); if (!r.ok) throw new Error("HTTP " + r.status); const h = await r.json(); setConnected(true); Alert.alert("Сервер доступен", h.aiConfigured ? "Соединение установлено. ИИ-сервис настроен." : "Соединение установлено, но OPENAI_API_KEY на сервере не задан."); } catch (e) { Alert.alert("Нет соединения", "Настройки сохранены, но сервер недоступен: " + String(e)); } };
  const saveMemory = async () => { await AsyncStorage.setItem("memory", memory); Alert.alert("Сохранено", "Локальная заметка памяти сохранена."); };
  const clearChat = () => Alert.alert("Очистить историю?", "История чата будет удалена с этого устройства.", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: async () => { await AsyncStorage.removeItem("chat"); setMessages([]); } }]);
  const tabs: Tab[] = ["Чат", "Задачи", "Агенты", "Память", "Настройки"];
  return <SafeAreaView style={s.safe}><StatusBar style="light" backgroundColor={C.bg} /><View style={s.header}><View><Text style={s.brand}>ЛИЧНЫЙ ИИ-АГЕНТ</Text><Text style={s.sub}>Локальный клиент · русский интерфейс</Text></View><View style={s.status}><View style={[s.dot, { backgroundColor: connected ? "#39C978" : C.orange }]} /><Text style={s.statusText}>{connected ? "СЕРВЕР ДОСТУПЕН" : endpoint ? "АДРЕС ЗАДАН" : "НЕ ПОДКЛЮЧЁН"}</Text></View></View>
  <View style={s.nav}>{tabs.map(t => <Pressable key={t} onPress={() => setTab(t)} style={[s.navItem, tab === t && s.navActive]}><Text style={[s.navText, tab === t && s.navTextActive]}>{t}</Text></Pressable>)}</View>
  {tab === "Чат" && <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView style={s.fill} contentContainerStyle={s.chat}>{messages.map(m => <View key={m.id} style={[s.bubble, m.role === "user" ? s.userBubble : s.aiBubble]}><Text style={s.role}>{m.role === "user" ? "ВЫ" : "АГЕНТ"} · {m.time}</Text><Text style={s.message}>{m.text}</Text></View>)}</ScrollView><View style={s.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Введите сообщение..." placeholderTextColor={C.muted} multiline style={s.input} /><Pressable onPress={send} disabled={busy || !draft.trim()} style={[s.send, (busy || !draft.trim()) && s.disabled]}><Text style={s.sendText}>{busy ? "…" : "➤"}</Text></Pressable></View></KeyboardAvoidingView>}
  {tab === "Задачи" && <ScrollView contentContainerStyle={s.page}><Text style={s.h1}>Задачи</Text><Text style={s.note}>Здесь будут фоновые поручения, очередь выполнения, этапы, журнал и уведомления. Серверный исполнитель ещё не развёрнут — фиктивные статусы не показываются.</Text><Panel title="Состояние очереди" value="Нет подключённого исполнителя" /></ScrollView>}
  {tab === "Агенты" && <ScrollView contentContainerStyle={s.page}><Text style={s.h1}>Специализированные агенты</Text><Text style={s.note}>Архитектура предусматривает подключаемые роли и инструменты. Каталог станет активным после запуска backend и реестра модулей.</Text>{["Поиск и проверка источников","Разработка приложений","Работа с файлами","Мультимедиа","Управление Android"].map(x => <Panel key={x} title={x} value="Не подключён" />)}</ScrollView>}
  {tab === "Память" && <ScrollView contentContainerStyle={s.page}><Text style={s.h1}>Память</Text><Text style={s.note}>Пока это локальная заметка на устройстве, не полноценная долговременная память агента.</Text><TextInput value={memory} onChangeText={setMemory} multiline style={s.textarea} placeholderTextColor={C.muted} /><Action label="Сохранить заметку" onPress={saveMemory} /></ScrollView>}
  {tab === "Настройки" && <ScrollView contentContainerStyle={s.page}><Text style={s.h1}>Подключение</Text><Text style={s.note}>Укажите HTTPS-адрес серверного API. Ключи моделей в APK не хранятся.</Text><Text style={s.label}>Адрес backend</Text><TextInput value={endpoint} onChangeText={setEndpoint} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://ваш-сервер.example" placeholderTextColor={C.muted} style={s.field} /><Text style={s.label}>Токен доступа к серверу</Text><TextInput value={apiToken} onChangeText={setApiToken} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="AGENT_API_TOKEN" placeholderTextColor={C.muted} style={s.field} /><Action label="Сохранить подключение" onPress={saveEndpoint} /><View style={s.separator} /><Text style={s.h1}>Данные</Text><Action label="Очистить историю чата" onPress={clearChat} danger /><Text style={s.footer}>Версия клиента 0.1.0 · Все подписи и системные сообщения приложения — на русском языке.</Text></ScrollView>}
  </SafeAreaView>;
}
function Panel({title, value}: {title:string; value:string}) { return <View style={s.panel}><Text style={s.panelTitle}>{title}</Text><Text style={s.panelValue}>{value}</Text></View>; }
function Action({label,onPress,danger=false}:{label:string;onPress:()=>void;danger?:boolean}) { return <Pressable onPress={onPress} style={[s.action,danger&&s.danger]}><Text style={s.actionText}>{label}</Text></Pressable>; }
const s = StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},fill:{flex:1},header:{paddingHorizontal:18,paddingTop:12,paddingBottom:15,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},brand:{color:C.orange,fontSize:17,fontWeight:"900",letterSpacing:1.4},sub:{color:C.muted,fontSize:11,marginTop:4},status:{alignItems:"flex-end",gap:5},dot:{width:8,height:8,borderRadius:8},statusText:{color:C.muted,fontSize:9,fontWeight:"700"},nav:{flexDirection:"row",borderTopWidth:1,borderBottomWidth:1,borderColor:C.line,justifyContent:"space-around"},navItem:{paddingVertical:13,paddingHorizontal:5,borderBottomWidth:2,borderBottomColor:"transparent"},navActive:{borderBottomColor:C.orange},navText:{color:C.muted,fontSize:11,fontWeight:"600"},navTextActive:{color:C.orange},chat:{padding:14,gap:12},bubble:{maxWidth:"90%",padding:13,borderRadius:13},userBubble:{alignSelf:"flex-end",backgroundColor:"#332012",borderWidth:1,borderColor:"#744017"},aiBubble:{alignSelf:"flex-start",backgroundColor:C.panel,borderWidth:1,borderColor:C.line},role:{color:C.orange,fontSize:9,fontWeight:"800",marginBottom:7},message:{color:C.text,fontSize:14,lineHeight:21},composer:{flexDirection:"row",alignItems:"flex-end",gap:9,padding:12,borderTopWidth:1,borderColor:C.line},input:{flex:1,minHeight:46,maxHeight:120,backgroundColor:C.panel2,color:C.text,borderRadius:12,paddingHorizontal:13,paddingVertical:10,fontSize:14},send:{width:46,height:46,backgroundColor:C.orange,borderRadius:12,alignItems:"center",justifyContent:"center"},sendText:{color:"#111",fontSize:20,fontWeight:"900"},disabled:{opacity:.4},page:{padding:18,gap:14},h1:{color:C.text,fontSize:23,fontWeight:"800",marginBottom:3},note:{color:C.muted,fontSize:13,lineHeight:20,marginBottom:5},panel:{backgroundColor:C.panel,padding:15,borderRadius:12,borderWidth:1,borderColor:C.line,gap:7},panelTitle:{color:C.text,fontWeight:"700",fontSize:14},panelValue:{color:C.orange,fontSize:12},textarea:{minHeight:150,backgroundColor:C.panel,color:C.text,borderRadius:12,padding:13,textAlignVertical:"top",borderWidth:1,borderColor:C.line},action:{backgroundColor:C.orange,padding:14,borderRadius:11,alignItems:"center"},danger:{backgroundColor:"#3A1715",borderWidth:1,borderColor:C.red},actionText:{color:"#111",fontWeight:"800"},label:{color:C.orange,fontSize:12,fontWeight:"700"},field:{backgroundColor:C.panel,color:C.text,padding:14,borderRadius:10,borderWidth:1,borderColor:C.line},separator:{height:1,backgroundColor:C.line,marginVertical:10},footer:{color:C.muted,fontSize:11,lineHeight:17,marginTop:10}
});