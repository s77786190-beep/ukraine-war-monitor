package ru.ukrainewarmonitor

import android.os.Bundle
import android.util.Xml
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.work.Worker
import androidx.work.WorkerParameters
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import androidx.work.WorkManager
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.ExistingPeriodicWorkPolicy
import java.util.concurrent.TimeUnit
import org.xmlpull.v1.XmlPullParser
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val Background = Color(0xFF101010)
private val SurfaceDark = Color(0xFF1B1B1B)
private val Orange = Color(0xFFF0A23A)
private val MainText = Color(0xFFE8E3D8)
private val MutedText = Color(0xFFAAA69D)
private val DarkColors = darkColorScheme(primary = Orange, onPrimary = Color(0xFF211507), secondary = Orange,
    background = Background, surface = SurfaceDark, onBackground = MainText, onSurface = MainText,
    surfaceVariant = Color(0xFF292722), onSurfaceVariant = MutedText)

data class Story(val title: String, val source: String, val link: String, val date: String, val timestamp: Long, val side: String = "Агрегатор") { val language: String get() = detectLanguage(title) }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(16, 16, 16)
        window.navigationBarColor = android.graphics.Color.rgb(16, 16, 16)
        val periodic = PeriodicWorkRequestBuilder<FeedRefreshWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(applicationContext).enqueueUniquePeriodicWork(
            "automatic_news_refresh", ExistingPeriodicWorkPolicy.KEEP, periodic
        )
        setContent { MaterialTheme(colorScheme = DarkColors) { MonitorScreen() } }
    }
}

private val tabs = listOf("Сводка", "Официальные", "Неофициальные", "Регионы", "Соцсети", "Видео", "Карты")
private val regions = listOf("Все регионы", "Костромская область", "Ивановская область", "Владимирская область",
    "Московская область", "Белгородская область", "Курская область", "Брянская область", "Воронежская область",
    "Ростовская область", "Краснодарский край", "Ленинградская область", "Псковская область", "Калужская область")

@Composable
fun MonitorScreen() {
    var stories by remember { mutableStateOf<List<Story>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var tab by remember { mutableIntStateOf(0) }
    var search by remember { mutableStateOf("") }
    var region by remember { mutableStateOf(regions.first()) }
    var regionMenu by remember { mutableStateOf(false) }
    var period by remember { mutableStateOf("7 дней") }
    var languageFilter by remember { mutableStateOf("Все языки") }
    var pageSize by remember { mutableIntStateOf(20) }
    var page by remember { mutableIntStateOf(1) }
    var pageMenu by remember { mutableStateOf(false) }
    var help by remember { mutableStateOf(false) }
    val periods = listOf("24 часа", "7 дней", "30 дней", "За всё время")
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    fun open(url: String) { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    fun refresh() {
        scope.launch {
            loading = true; error = ""
            try { stories = withContext(Dispatchers.IO) { loadFeeds(tab, region, languageFilter) }; saveCachedStories(context, stories); page = 1 }
            catch (_: Exception) { error = "Часть лент недоступна. Попробуйте обновить или открыть источник напрямую." }
            loading = false
        }
    }
    LaunchedEffect(Unit) { val cached = withContext(Dispatchers.IO) { readCachedStories(context) }; if (cached.isNotEmpty()) stories = cached }
    LaunchedEffect(tab, region, languageFilter) { if (tab in 0..5) refresh() }

    val cutoff = when (period) {
        "24 часа" -> System.currentTimeMillis() - 86400000L
        "7 дней" -> System.currentTimeMillis() - 604800000L
        "30 дней" -> System.currentTimeMillis() - 2592000000L
        else -> 0L
    }
    val filtered = stories.filter { it.timestamp == 0L || it.timestamp >= cutoff }
        .filter { languageFilter == "Все языки" || (languageFilter == "Русский" && it.language == "ru") || (languageFilter == "English" && it.language == "en") || (languageFilter == "Deutsch" && it.language == "de") }
        .filter { search.isBlank() || it.title.contains(search, true) || it.source.contains(search, true) }
        .sortedByDescending { it.timestamp }
    val pageCount = maxOf(1, (filtered.size + pageSize - 1) / pageSize)
    val safePage = page.coerceIn(1, pageCount)
    val visible = filtered.drop((safePage - 1) * pageSize).take(pageSize)

    Column(Modifier.fillMaxSize().background(Background).padding(horizontal = 12.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("МОНИТОР ВОЙНЫ", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MainText)
                Text("Разные источники · проверяйте первоисточники", style = MaterialTheme.typography.bodySmall, color = MutedText)
            }
            TextButton(onClick = { help = true }) { Text("О приложении", color = Orange) }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            tabs.forEachIndexed { i, name ->
                FilterChip(selected = tab == i, onClick = { tab = i; page = 1 },
                    label = { Text(name) }, colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Orange, selectedLabelColor = Color(0xFF211507), labelColor = MainText))
            }
        }
        if (tab == 6) {
            EmbeddedMapsScreen()
        } else {            if (tab == 3) {
                Text("РЕГИОН", color = Orange, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Box {
                    OutlinedButton(onClick = { regionMenu = true }, modifier = Modifier.fillMaxWidth()) {
                        Text("$region  ▾", color = MainText)
                    }
                    DropdownMenu(expanded = regionMenu, onDismissRequest = { regionMenu = false }) {
                        regions.forEach { r -> DropdownMenuItem(text = { Text(r) }, onClick = { region = r; regionMenu = false; page = 1 }) }
                    }
                }
            }
            OutlinedTextField(value = search, onValueChange = { search = it; page = 1 },
                modifier = Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text("Поиск по заголовку или источнику", color = MutedText) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Orange, unfocusedBorderColor = Color(0xFF51483B),
                    focusedTextColor = MainText, unfocusedTextColor = MainText, cursorColor = Orange))
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("ЯЗЫК", color = Orange, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                listOf("Все языки", "Русский", "English", "Deutsch").forEach { lang ->
                    TextButton(onClick = { languageFilter = lang; page = 1 }, contentPadding = PaddingValues(horizontal = 3.dp)) {
                        Text(if (languageFilter == lang) "[$lang]" else lang, color = if (languageFilter == lang) Orange else MutedText, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("ПЕРИОД", color = Orange, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                periods.forEach { p ->
                    TextButton(onClick = { period = p; page = 1 }, contentPadding = PaddingValues(horizontal = 4.dp)) {
                        Text(if (period == p) "[$p]" else p, color = if (period == p) Orange else MutedText, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { refresh() }, colors = ButtonDefaults.buttonColors(containerColor = Orange, contentColor = Color(0xFF211507))) {
                    Text("Обновить", fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(10.dp))
                if (loading) CircularProgressIndicator(Modifier.size(20.dp), color = Orange, strokeWidth = 2.dp)
                Spacer(Modifier.weight(1f))
                Box {
                    TextButton(onClick = { pageMenu = true }) { Text("$pageSize на странице ▾", color = Orange) }
                    DropdownMenu(expanded = pageMenu, onDismissRequest = { pageMenu = false }) {
                        listOf(10, 20, 30, 50).forEach { n -> DropdownMenuItem(text = { Text("$n новостей") }, onClick = { pageSize = n; page = 1; pageMenu = false }) }
                    }
                }
            }
            if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Text("НАЙДЕНО: ${filtered.size}  ·  Страница $safePage из $pageCount", color = MutedText, style = MaterialTheme.typography.labelMedium)
            if (visible.isEmpty() && !loading) Text("Публикаций по выбранным условиям нет. Попробуйте другой период или обновите ленту.", color = MutedText, modifier = Modifier.padding(12.dp))
            LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
                items(visible) { story ->
                    Card(Modifier.fillMaxWidth().clickable { open(story.link) }, shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = SurfaceDark)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(story.title, style = MaterialTheme.typography.titleMedium, color = MainText, fontWeight = FontWeight.Medium)
                            Spacer(Modifier.height(7.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(color = Orange, shape = RoundedCornerShape(5.dp)) {
                                    Text(story.source, color = Color(0xFF211507), style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp))
                                }
                                Spacer(Modifier.width(7.dp))
                                Text(story.side, color = MutedText, style = MaterialTheme.typography.labelSmall)
                                Spacer(Modifier.weight(1f))
                                Text(formatDate(story.timestamp), color = MutedText, style = MaterialTheme.typography.labelSmall)
                            }
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text("Открыть публикацию ↗", color = Orange, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f).clickable { open(story.link) }.padding(top = 5.dp))
                                if (story.language != "ru") TextButton(onClick = { open("https://translate.google.com/translate?sl=auto&tl=ru&u=" + URLEncoder.encode(story.link, "UTF-8")) }) { Text("Перевести на русский", color = Orange, style = MaterialTheme.typography.labelSmall) }
                            }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { page = 1 }, enabled = safePage > 1) { Text("В начало", color = Orange) }
                TextButton(onClick = { page = (safePage - 1).coerceAtLeast(1) }, enabled = safePage > 1) { Text("‹", color = Orange) }
                Text("$safePage / $pageCount", color = MainText)
                TextButton(onClick = { page = (safePage + 1).coerceAtMost(pageCount) }, enabled = safePage < pageCount) { Text("›", color = Orange) }
                TextButton(onClick = { page = pageCount }, enabled = safePage < pageCount) { Text("В конец", color = Orange) }
            }
        }
    }
    if (help) AlertDialog(onDismissRequest = { help = false }, containerColor = SurfaceDark,
        title = { Text("Источники и ограничения", color = MainText) },
        text = { Text("Лента объединяет RSS нескольких российских и зарубежных СМИ, поисковые RSS Google и Яндекса, а также YouTube RSS по тематическим запросам. Вкладки карт и соцсетей дают прямой доступ к публичным страницам.\n\nИсточники могут ошибаться, публиковать пропаганду или непроверенные сообщения. Метка стороны означает тип/происхождение источника, а не подтверждение достоверности. Сообщения очевидцев требуют независимой проверки. Закрытые соцсети и произвольные личные аккаунты автоматически не читаются.", color = MainText) },
        confirmButton = { TextButton(onClick = { help = false }) { Text("Закрыть", color = Orange) } })
}

@Composable
private fun MapLink(title: String, url: String, open: (String) -> Unit) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { open(url) }, colors = CardDefaults.cardColors(containerColor = SurfaceDark)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = MainText, modifier = Modifier.weight(1f))
            Text("Открыть ↗", color = Orange, style = MaterialTheme.typography.labelMedium)
        }
    }
}


private data class MapSource(val title: String, val url: String, val note: String)

@Composable
private fun EmbeddedMapsScreen() {
    val context = LocalContext.current
    var activeWebView by remember { mutableStateOf<WebView?>(null) }
    val sources = listOf(
        MapSource("Удары Украина", "https://battlemap.online/conflicts/ukraine/en", "Интерактивная карта событий по Украине: удары, БПЛА, ракеты, обстрелы, взрывы и сообщения о продвижениях. Есть даты, категории, координаты и ссылки на источники. События — публичные сообщения, а не автоматически подтверждённые факты."),
        MapSource("Инциденты Россия", "https://battlemap.online/conflicts/russia/en", "Карта сообщений об инцидентах на территории России: БПЛА, взрывы, обстрелы, пожары и объявленные перехваты. У событий есть время, координаты и ссылки на публикации; версии сторон показываются отдельно."),
        MapSource("Европа — БПЛА", "https://droneobservatory.eu/en", "Европейская обсерватория инцидентов БПЛА: интерактивные метки, карточки, фильтры и слой Украины. Не является полным реестром ракетных ударов."),
        MapSource("DIVGEN", "https://divgen.ru/46.98025/31.99493/9", "Карта DIVGEN открывается внутри приложения. Методика и обозначения принадлежат автору проекта."),
        MapSource("LostArmour", "https://lostarmour.info/map", "Карта LostArmour с режимами ударов и изменений линии фронта. Данные и оценки принадлежат проекту."),
        MapSource("DeepState", "https://deepstatemap.live/", "Карта DeepState с собственной методикой оценки линии фронта."),
        MapSource("Подоляка · официальный канал", "https://t.me/s/yurasumy", "Источник: публичная веб-лента точного канала @yurasumy — https://t.me/yurasumy. Используется только этот адрес, без каналов-клонов и посреднических подборок. Здесь можно просматривать опубликованные изображения карт; доступность увеличения и перемещения зависит от отображения Telegram Web в Android WebView."),
        MapSource("RUBIZH", "https://rubizhmap.com/", "Дополнительная интерактивная карта с историей изменений и датами.")
    )
    var selected by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        Text("КАРТЫ ВНУТРИ ПРИЛОЖЕНИЯ", color = Orange, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            sources.forEachIndexed { index, source ->
                FilterChip(selected = selected == index, onClick = { selected = index }, label = { Text(source.title) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Orange, selectedLabelColor = Color(0xFF211507), labelColor = MainText))
            }
        }
        Text(sources[selected].note, color = MutedText, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { activeWebView?.reload() }, modifier = Modifier.weight(1f)) { Text("Перезагрузить", color = Orange) }
            OutlinedButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(sources[selected].url))) }, modifier = Modifier.weight(1f)) { Text("Открыть отдельно", color = Orange) }
        }
        AndroidView(
            modifier = Modifier.fillMaxSize().weight(1f),
            factory = { ctx ->
                WebView(ctx).apply {
                    setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.databaseEnabled = true
                    settings.allowContentAccess = true
                    settings.allowFileAccess = false
                    settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    android.webkit.CookieManager.getInstance().setAcceptCookie(true)
                    android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                    settings.loadsImagesAutomatically = true
                    settings.setSupportZoom(true)
                    settings.builtInZoomControls = true
                    settings.displayZoomControls = false
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = true
                    settings.javaScriptCanOpenWindowsAutomatically = true
                    settings.setSupportMultipleWindows(false)
                    webViewClient = WebViewClient()
                    webChromeClient = WebChromeClient()
                    activeWebView = this
                    tag = sources[selected].url
                    loadUrl(sources[selected].url)
                }
            },
            update = { view ->
                val target = sources[selected].url
                if (view.tag != target) {
                    view.tag = target
                    view.loadUrl(target)
                }
            }
        )
    }
}

private data class Feed(val url: String, val label: String, val side: String)

internal fun loadFeeds(tab: Int, region: String, language: String = "Все языки"): List<Story> {
    val langParams = when (language) {
        "English" -> "hl=en-US&gl=US&ceid=US:en"
        "Deutsch" -> "hl=de&gl=DE&ceid=DE:de"
        else -> "hl=ru&gl=RU&ceid=RU:ru"
    }
    val feeds = mutableListOf<Feed>()
    fun google(query: String, label: String = "Google Новости") {
        feeds += Feed("https://news.google.com/rss/search?q=" + URLEncoder.encode(query, "UTF-8") + "&" + langParams, label, "Поисковый агрегатор")
    }
    if (tab == 3) {
        val terms = when (region) {
            "Костромская область" -> "Кострома OR Костромская область OR Костромской район"
            "Ивановская область" -> "Иваново OR Ивановская область"
            "Владимирская область" -> "Владимир OR Владимирская область"
            "Московская область" -> "Московская область OR Подмосковье"
            "Белгородская область" -> "Белгород OR Белгородская область"
            "Курская область" -> "Курск OR Курская область"
            "Брянская область" -> "Брянск OR Брянская область"
            "Воронежская область" -> "Воронеж OR Воронежская область"
            "Ростовская область" -> "Ростовская область OR Ростов-на-Дону"
            "Краснодарский край" -> "Краснодар OR Краснодарский край OR Кубань"
            "Ленинградская область" -> "Ленинградская область OR Ленобласть"
            "Псковская область" -> "Псков OR Псковская область"
            "Калужская область" -> "Калуга OR Калужская область"
            else -> "российские регионы"
        }
        google("($terms) (БПЛА OR беспилотник OR дрон OR взрыв OR ПВО OR атака OR обстрел OR ракета)", "Google Новости · регион")
    } else if (tab == 4) {
        // Public Telegram pages are read directly first; RSSHub is only a fallback.
        google("site:t.me/s (Украина OR фронт OR БПЛА OR беспилотник OR обстрел)", "Google · публичные соцсети")
    } else {
        val query = when (tab) {
            1 -> "официальное заявление Россия Украина война переговоры"
            2 -> "военкор фронт сводка продвижение войск Украина"
            5 -> "окончание войны Украина прогноз переговоры Россия"
            else -> "война Украина фронт переговоры продвижение войск"
        }
        google(query)
        if (tab == 0 || tab == 1 || tab == 2) feeds += listOf(
            Feed("https://tass.ru/rss/v2.xml", "ТАСС", "Российское СМИ"),
            Feed("https://ria.ru/export/rss2/archive/index.xml", "РИА Новости", "Российское СМИ"),
            Feed("https://russian.rt.com/rss", "RT", "Российское СМИ"),
            Feed("https://feeds.bbci.co.uk/russian/rss.xml", "BBC Русская служба", "Международное СМИ"),
            Feed("https://rss.dw.com/rdf/rss-ru-all", "DW", "Международное СМИ"),
            Feed("https://www.theguardian.com/world/rss", "The Guardian", "Западное СМИ")
        )
        if (tab == 0 || tab == 2) feeds += listOf(
            Feed("https://rsshub.app/telegram/channel/rybar", "Рыбарь · Telegram", "Публичный Telegram"),
            Feed("https://rsshub.app/telegram/channel/yurasumy", "Юрий Подоляка · Telegram", "Публичный Telegram"),
            Feed("https://rsshub.app/telegram/channel/boris_rozhin", "Colonelcassad · Telegram", "Публичный Telegram")
        )
        if (tab == 5) feeds += Feed("https://www.youtube.com/feeds/videos.xml?search_query=" + URLEncoder.encode(query, "UTF-8"), "YouTube", "Видеопоиск")
    }
    val all = mutableListOf<Story>()
    var successful = 0
    if (tab == 4 || tab == 0 || tab == 2) {
        val channels = listOf(
            Triple("rybar", "Рыбарь · Telegram", "Публичный Telegram"),
            Triple("yurasumy", "Юрий Подоляка · Telegram", "Публичный Telegram"),
            Triple("boris_rozhin", "Colonelcassad · Telegram", "Публичный Telegram")
        )
        channels.forEach { (channel, label, side) ->
            try { all += readTelegramPublic(channel, label, side); successful++ } catch (_: Exception) { }
        }
    }
    feeds.forEach { feed -> try { all += readFeed(feed); successful++ } catch (_: Exception) { } }
    if (successful == 0) throw java.io.IOException("Источники не ответили. Проверьте соединение или повторите позже.")
    val regional = if (tab == 3) when (region) {
        "Костромская область" -> listOf("костром", "kostroma")
        "Ивановская область" -> listOf("иванов", "ivanovo")
        "Владимирская область" -> listOf("владимир", "vladimir")
        "Московская область" -> listOf("подмосков", "московск", "moscow region")
        "Белгородская область" -> listOf("белгород", "belgorod")
        "Курская область" -> listOf("курск", "kursk")
        "Брянская область" -> listOf("брянск", "bryansk")
        "Воронежская область" -> listOf("воронеж", "voronezh")
        "Ростовская область" -> listOf("ростов", "rostov")
        "Краснодарский край" -> listOf("краснодар", "кубан", "krasnodar")
        "Ленинградская область" -> listOf("ленинград", "ленобласт", "петербург", "st. petersburg")
        "Псковская область" -> listOf("псков", "pskov")
        "Калужская область" -> listOf("калуг", "kaluga")
        else -> emptyList()
    } else emptyList()
    return all.distinctBy { it.link }
        .filter { regional.isEmpty() || regional.any { term -> it.title.contains(term, true) } }
        .sortedByDescending { it.timestamp }.take(300)
}

private fun readFeed(feed: Feed): List<Story> {
    val connection = URL(feed.url).openConnection().apply {
        connectTimeout = 5000; readTimeout = 6000
        setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")
    }
    val parser = Xml.newPullParser()
    connection.getInputStream().use { input ->
        parser.setInput(input, "UTF-8")
        val result = mutableListOf<Story>()
        var title = ""; var link = ""; var date = ""; var inside = false
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT && result.size < 80) {
            if (event == XmlPullParser.START_TAG) {
                if (parser.name == "item" || parser.name == "entry") { inside = true; title = ""; link = ""; date = "" }
                else if (inside && parser.name == "title") title = parser.nextText().trim()
                else if (inside && parser.name == "link") {
                    val href = parser.getAttributeValue(null, "href")
                    link = if (!href.isNullOrBlank()) href else parser.nextText().trim()
                } else if (inside && (parser.name == "pubDate" || parser.name == "published" || parser.name == "updated")) date = parser.nextText().trim()
            }
            if (event == XmlPullParser.END_TAG && (parser.name == "item" || parser.name == "entry")) {
                if (title.isNotBlank() && link.startsWith("http")) result += Story(title, feed.label, link, date, parseDate(date), feed.side)
                inside = false
            }
            event = parser.next()
        }
        return result
    }
}

private fun readTelegramPublic(channel: String, label: String, side: String): List<Story> {
    val connection = URL("https://t.me/s/$channel").openConnection().apply {
        connectTimeout = 7000
        readTimeout = 9000
        setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36")
    }
    val html = connection.getInputStream().bufferedReader(Charsets.UTF_8).use { it.readText() }
    val blocks = Regex("""<div class="tgme_widget_message_wrap.*?(?=<div class="tgme_widget_message_wrap|</section>)""", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))
        .findAll(html).toList()
    return blocks.mapNotNull { match ->
        val block = match.value
        val post = Regex("""data-post="([^"]+)"""").find(block)?.groupValues?.get(1) ?: return@mapNotNull null
        val rawText = Regex("""<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>""", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))
            .find(block)?.groupValues?.get(1) ?: ""
        val plain = rawText.replace(Regex("""<br\\s*/?>""", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("""<[^>]+>"""), " ")
            .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ")
            .replace(Regex("""\\s+"""), " ").trim()
        if (plain.isBlank()) return@mapNotNull null
        val date = Regex("""<time[^>]+datetime="([^"]+)"""").find(block)?.groupValues?.get(1) ?: ""
        val title = plain.take(260)
        Story(title, label, "https://t.me/$post", date, parseDate(date), side)
    }
}

private fun detectLanguage(value: String): String {
    if (value.any { it in 'А'..'я' || it == 'ё' || it == 'Ё' }) return "ru"
    val lower = " " + value.lowercase(Locale.ROOT) + " "
    val germanHints = listOf(" der ", " die ", " das ", " und ", " ist ", " für ", " mit ", "über ", "ä", "ö", "ü", "ß")
    return if (germanHints.any { lower.contains(it) }) "de" else "en"
}

private fun parseDate(value: String): Long {
    if (value.isBlank()) return 0L
    val normalized = value.trim().replace(Regex("\\.[0-9]{1,9}(?=Z|[+-][0-9:]+$)"), "")
    val patterns = listOf("EEE, dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm:ss z", "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    for (pattern in patterns) try { return SimpleDateFormat(pattern, Locale.US).parse(normalized)?.time ?: 0L } catch (_: Exception) { }
    return 0L
}

private fun formatDate(timestamp: Long): String =
    if (timestamp <= 0L) "Дата не указана" else SimpleDateFormat("dd.MM.yyyy · HH:mm", Locale.getDefault()).format(Date(timestamp))


private const val CACHE_PREFS = "monitor_cache"
private const val CACHE_KEY = "stories"
private fun readCachedStories(context: Context): List<Story> {
    return try {
        val raw = context.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE).getString(CACHE_KEY, "[]") ?: "[]"
        val array = JSONArray(raw)
        (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            Story(o.optString("title"), o.optString("source"), o.optString("link"), o.optString("date"), o.optLong("timestamp"), o.optString("side"))
        }
    } catch (_: Exception) { emptyList() }
}

private fun saveCachedStories(context: Context, stories: List<Story>) {
    val array = JSONArray()
    stories.forEach { s -> array.put(JSONObject().put("title", s.title).put("source", s.source).put("link", s.link).put("date", s.date).put("timestamp", s.timestamp).put("side", s.side)) }
    context.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE).edit().putString(CACHE_KEY, array.toString()).apply()
}
class FeedRefreshWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
    override fun doWork(): Result = try {
        val combined = (loadFeeds(0, "Все регионы") + loadFeeds(2, "Все регионы") + loadFeeds(4, "Все регионы") + loadFeeds(5, "Все регионы")).distinctBy { it.link }.sortedByDescending { it.timestamp }.take(500)
        if (combined.isNotEmpty()) saveCachedStories(applicationContext, combined)
        Result.success()
    } catch (_: Exception) { Result.retry() }
}