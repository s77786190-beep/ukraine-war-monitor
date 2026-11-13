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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
private val DarkColors = darkColorScheme(
    primary = Orange,
    onPrimary = Color(0xFF211507),
    secondary = Orange,
    background = Background,
    surface = SurfaceDark,
    onBackground = MainText,
    onSurface = MainText,
    surfaceVariant = Color(0xFF292722),
    onSurfaceVariant = MutedText
)

data class Story(val title: String, val source: String, val link: String, val date: String, val timestamp: Long)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(16, 16, 16)
        window.navigationBarColor = android.graphics.Color.rgb(16, 16, 16)
        setContent { MaterialTheme(colorScheme = DarkColors) { MonitorScreen() } }
    }
}

@Composable
fun MonitorScreen() {
    var stories by remember { mutableStateOf<List<Story>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Все") }
    var search by remember { mutableStateOf("") }
    var period by remember { mutableStateOf("За всё время") }
    var pageSize by remember { mutableIntStateOf(20) }
    var page by remember { mutableIntStateOf(1) }
    var showPageSizeMenu by remember { mutableStateOf(false) }
    var showHelp by remember { mutableStateOf(false) }
    val categories = listOf("Все", "Фронт", "Переговоры", "Международная реакция")
    val periods = listOf("За всё время", "24 часа", "7 дней", "30 дней")
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    fun refresh() {
        scope.launch {
            loading = true
            error = ""
            try {
                stories = withContext(Dispatchers.IO) { loadFeeds(category) }
                page = 1
            } catch (e: Exception) {
                error = "Не удалось обновить ленту. Проверьте подключение к интернету."
            }
            loading = false
        }
    }
    LaunchedEffect(category) { refresh() }

    val cutoff = when (period) {
        "24 часа" -> System.currentTimeMillis() - 24L * 60 * 60 * 1000
        "7 дней" -> System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000
        "30 дней" -> System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000
        else -> 0L
    }
    val filtered = stories
        .filter { it.timestamp >= cutoff }
        .filter { search.isBlank() || it.title.contains(search, true) || it.source.contains(search, true) }
        .sortedByDescending { it.timestamp }
    val pageCount = maxOf(1, minOf(5, (filtered.size + pageSize - 1) / pageSize))
    val safePage = page.coerceIn(1, pageCount)
    val visibleStories = filtered.drop((safePage - 1) * pageSize).take(pageSize)

    Column(
        Modifier.fillMaxSize().background(Background).padding(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("МОНИТОР ВОЙНЫ", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MainText)
                Text("Лента событий · сначала новые", style = MaterialTheme.typography.bodySmall, color = MutedText)
            }
            TextButton(onClick = { showHelp = true }) { Text("Возможности", color = Orange) }
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = search,
            onValueChange = { search = it; page = 1 },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text("Поиск по заголовку или источнику", color = MutedText) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Orange, unfocusedBorderColor = Color(0xFF51483B),
                focusedTextColor = MainText, unfocusedTextColor = MainText,
                cursorColor = Orange
            )
        )
        Spacer(Modifier.height(10.dp))
        Text("ТЕМАТИКА", color = Orange, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            categories.forEach { c ->
                FilterChip(
                    selected = category == c,
                    onClick = { category = c; page = 1 },
                    label = { Text(c) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Orange, selectedLabelColor = Color(0xFF211507),
                        labelColor = MainText
                    )
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("ПЕРИОД", color = Orange, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            periods.forEach { p ->
                FilterChip(
                    selected = period == p,
                    onClick = { period = p; page = 1 },
                    label = { Text(p) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Orange, selectedLabelColor = Color(0xFF211507),
                        labelColor = MainText
                    )
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Button(
                onClick = { refresh() },
                colors = ButtonDefaults.buttonColors(containerColor = Orange, contentColor = Color(0xFF211507))
            ) { Text("Обновить ленту", fontWeight = FontWeight.Bold) }
            Spacer(Modifier.width(12.dp))
            if (loading) CircularProgressIndicator(Modifier.size(22.dp), color = Orange, strokeWidth = 2.dp)
            Spacer(Modifier.weight(1f))
            Box {
                TextButton(onClick = { showPageSizeMenu = true }) {
                    Text("$pageSize на странице  ▾", color = Orange)
                }
                DropdownMenu(expanded = showPageSizeMenu, onDismissRequest = { showPageSizeMenu = false }) {
                    listOf(20, 30, 40, 50).forEach { count ->
                        DropdownMenuItem(text = { Text("$count новостей") }, onClick = {
                            pageSize = count; page = 1; showPageSizeMenu = false
                        })
                    }
                }
            }
        }
        if (error.isNotBlank()) {
            Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("НАЙДЕНО: ${filtered.size}", color = MutedText, style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.weight(1f))
            Text("Страница $safePage из $pageCount", color = MutedText, style = MaterialTheme.typography.labelMedium)
        }
        Spacer(Modifier.height(6.dp))
        if (visibleStories.isEmpty() && !loading) {
            Text("По выбранным фильтрам новостей нет. Измените период или поисковый запрос.", color = MutedText, modifier = Modifier.padding(12.dp))
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(9.dp),
            contentPadding = PaddingValues(bottom = 8.dp)
        ) {
            items(visibleStories) { story ->
                Card(
                    modifier = Modifier.fillMaxWidth().clickable {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(story.link)))
                    },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark)
                ) {
                    Column(Modifier.padding(13.dp)) {
                        Text(story.title, style = MaterialTheme.typography.titleMedium, color = MainText, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(9.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(color = Orange, shape = RoundedCornerShape(5.dp)) {
                                Text(
                                    story.source.ifBlank { "Источник не указан" },
                                    color = Color(0xFF211507),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                            Spacer(Modifier.width(8.dp))
                            Text(formatDate(story.timestamp), color = MutedText, style = MaterialTheme.typography.bodySmall)
                        }
                        Spacer(Modifier.height(5.dp))
                        Text("Открыть первоисточник  ↗", color = Orange, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 5.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = { page = 1 }, enabled = safePage > 1) { Text("Первая", color = Orange) }
            TextButton(onClick = { page = (safePage - 1).coerceAtLeast(1) }, enabled = safePage > 1) { Text("‹", color = Orange) }
            (1..pageCount).forEach { p ->
                TextButton(onClick = { page = p }) {
                    Text("$p", color = if (p == safePage) Orange else MutedText, fontWeight = if (p == safePage) FontWeight.Bold else FontWeight.Normal)
                }
            }
            TextButton(onClick = { page = (safePage + 1).coerceAtMost(pageCount) }, enabled = safePage < pageCount) { Text("›", color = Orange) }
            TextButton(onClick = { page = pageCount }, enabled = safePage < pageCount) { Text("Последняя", color = Orange) }
        }
    }

    if (showHelp) {
        AlertDialog(
            onDismissRequest = { showHelp = false },
            containerColor = SurfaceDark,
            title = { Text("Возможности приложения", color = MainText) },
            text = {
                Text(
                    "• Лента автоматически сортируется: новые публикации сверху.\n" +
                    "• Поиск по заголовкам и названиям источников.\n" +
                    "• Фильтры по тематике и периоду публикации.\n" +
                    "• На странице можно показывать 20, 30, 40 или 50 новостей.\n" +
                    "• До пяти страниц, переход к первой и последней.\n" +
                    "• Нажатие на карточку открывает первоисточник.\n\n" +
                    "Сейчас лента формируется через Google Новости RSS; это не полный охват всех каналов и соцсетей.",
                    color = MainText
                )
            },
            confirmButton = { TextButton(onClick = { showHelp = false }) { Text("Закрыть", color = Orange) } }
        )
    }
}

private fun loadFeeds(category: String): List<Story> {
    val query = when (category) {
        "Фронт" -> "война Украина фронт продвижение войск"
        "Переговоры" -> "Украина Россия переговоры окончание войны"
        "Международная реакция" -> "Ukraine war international response"
        else -> "война Украина фронт переговоры"
    }
    val url = "https://news.google.com/rss/search?q=" + URLEncoder.encode(query, "UTF-8") + "&hl=ru&gl=UA&ceid=UA:ru"
    val parser = Xml.newPullParser()
    URL(url).openConnection().apply {
        connectTimeout = 12000
        readTimeout = 12000
    }.getInputStream().use { input ->
        parser.setInput(input, "UTF-8")
        val result = mutableListOf<Story>()
        var title = ""
        var link = ""
        var source = "Google Новости"
        var date = ""
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT && result.size < 100) {
            if (event == XmlPullParser.START_TAG) when (parser.name) {
                "item" -> { title = ""; link = ""; source = "Google Новости"; date = "" }
                "title" -> title = parser.nextText()
                "link" -> link = parser.nextText()
                "pubDate" -> date = parser.nextText()
                "source" -> source = parser.nextText()
            }
            if (event == XmlPullParser.END_TAG && parser.name == "item" && title.isNotBlank() && link.isNotBlank()) {
                result.add(Story(title, source, link, date, parseDate(date)))
            }
            event = parser.next()
        }
        return result.sortedByDescending { it.timestamp }
    }
}

private fun parseDate(value: String): Long {
    if (value.isBlank()) return 0L
    return try {
        SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss Z", Locale.US).parse(value)?.time ?: 0L
    } catch (_: Exception) { 0L }
}

private fun formatDate(timestamp: Long): String {
    if (timestamp <= 0L) return "Дата не указана"
    return SimpleDateFormat("dd.MM.yyyy · HH:mm", Locale.getDefault()).format(Date(timestamp))
}
