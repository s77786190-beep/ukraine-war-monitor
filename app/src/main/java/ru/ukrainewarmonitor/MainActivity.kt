package ru.ukrainewarmonitor

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.xmlpull.v1.XmlPullParser
import android.util.Xml
import java.net.URL

data class Story(val title: String, val source: String, val link: String, val date: String)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { MonitorScreen() } }
    }
}

@Composable
fun MonitorScreen() {
    var stories by remember { mutableStateOf<List<Story>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Все") }
    val categories = listOf("Все", "Фронт", "Переговоры", "Международная реакция")
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    fun refresh() {
        scope.launch {
            loading = true
            error = ""
            try { stories = withContext(Dispatchers.IO) { loadFeeds(category) } }
            catch (e: Exception) { error = "Не удалось обновить ленту. Проверьте подключение к интернету." }
            loading = false
        }
    }
    LaunchedEffect(category) { refresh() }

    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Text("Монитор войны", style = MaterialTheme.typography.headlineMedium)
        Text("Новости и сообщения СМИ. Проверяйте первоисточник и дату публикации.", style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            categories.forEach { c ->
                FilterChip(selected = category == c, onClick = { category = c }, label = { Text(c) })
            }
        }
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Button(onClick = { refresh() }) { Text("Обновить") }
            if (loading) { Spacer(Modifier.width(12.dp)); CircularProgressIndicator(Modifier.size(22.dp)) }
        }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(stories) { s ->
                Card(Modifier.fillMaxWidth().clickable {
                    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(s.link))
                    context.startActivity(intent)
                }) {
                    Column(Modifier.padding(12.dp)) {
                        Text(s.title, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text("${s.source} · ${s.date}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

private fun loadFeeds(category: String): List<Story> {
    val query = when(category) {
        "Фронт" -> "война Украина фронт продвижение войск"
        "Переговоры" -> "Украина Россия переговоры окончание войны"
        "Международная реакция" -> "Ukraine war international response"
        else -> "война Украина фронт переговоры"
    }
    val url = "https://news.google.com/rss/search?q=" + java.net.URLEncoder.encode(query, "UTF-8") + "&hl=ru&gl=UA&ceid=UA:ru"
    val parser = Xml.newPullParser()
    URL(url).openConnection().apply { connectTimeout = 12000; readTimeout = 12000 }.getInputStream().use { input ->
        parser.setInput(input, "UTF-8")
        val result = mutableListOf<Story>()
        var title = ""; var link = ""; var source = "Google Новости"; var date = ""
        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT && result.size < 60) {
            if (event == XmlPullParser.START_TAG) when(parser.name) {
                "item" -> { title = ""; link = ""; source = "Google Новости"; date = "" }
                "title" -> title = parser.nextText()
                "link" -> link = parser.nextText()
                "pubDate" -> date = parser.nextText()
                "source" -> source = parser.nextText()
            }
            if (event == XmlPullParser.END_TAG && parser.name == "item" && title.isNotBlank() && link.isNotBlank()) {
                result.add(Story(title, source, link, date))
            }
            event = parser.next()
        }
        return result
    }
}
