import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

const STORAGE_KEY = "monitor_interval_minutes";
const INTERVALS = [
  { value: 5, label: "5 минут" },
  { value: 10, label: "10 минут" },
  { value: 15, label: "15 минут" },
  { value: 20, label: "20 минут" },
  { value: 30, label: "30 минут" },
  { value: 45, label: "45 минут" },
  { value: 60, label: "1 час" },
  { value: 180, label: "3 часа" },
  { value: 300, label: "5 часов" },
  { value: 720, label: "12 часов" },
  { value: 1440, label: "24 часа" }
];

export default function App() {
  const [interval, setIntervalValue] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        const parsed = Number(value);
        if (INTERVALS.some(item => item.value === parsed)) setIntervalValue(parsed);
      })
      .catch(() => Alert.alert("Ошибка", "Не удалось загрузить настройки."))
      .finally(() => setLoading(false));
  }, []);

  const chooseInterval = async (value: number) => {
    setIntervalValue(value);
    setSaved(false);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(value));
      setSaved(true);
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить интервал на устройстве.");
    }
  };

  const selectedLabel = INTERVALS.find(item => item.value === interval)?.label ?? "30 минут";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" backgroundColor="#080808" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>РЕГИОНАЛЬНЫЙ МОНИТОРИНГ</Text>
        <Text style={styles.title}>Костромская область</Text>
        <Text style={styles.subtitle}>Новости и сообщения об инцидентах</Text>

        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Мониторинг настраивается</Text>
            <Text style={styles.statusText}>Подключение источников и серверная проверка ещё не активированы.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Настройки проверки</Text>
        <Text style={styles.description}>
          Выберите, как часто приложение должно запрашивать обновления. По умолчанию — каждые 30 минут.
        </Text>

        <View style={styles.selectedCard}>
          <Text style={styles.selectedCaption}>ТЕКУЩИЙ ИНТЕРВАЛ</Text>
          <Text style={styles.selectedValue}>{selectedLabel}</Text>
          <Text style={styles.saveState}>{loading ? "Загрузка настроек…" : saved ? "Настройка сохранена на устройстве" : "Сохранение…"}</Text>
        </View>

        <View style={styles.options}>
          {INTERVALS.map(item => {
            const active = interval === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => chooseInterval(item.value)}
                style={[styles.option, active && styles.optionActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{item.label}</Text>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footer}>
          Частота фактического обновления будет зависеть от доступности источников и работы серверного планировщика.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const ORANGE = "#FF861A";
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080808" },
  container: { padding: 20, paddingBottom: 42 },
  kicker: { color: ORANGE, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginTop: 16 },
  title: { color: "#FFFFFF", fontSize: 27, fontWeight: "800", marginTop: 8 },
  subtitle: { color: "#A6A6A6", fontSize: 14, marginTop: 6 },
  statusCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#17130F", borderColor: "#49301B", borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 24 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: ORANGE, marginRight: 12 },
  statusTitle: { color: "#F5F5F5", fontSize: 14, fontWeight: "700" },
  statusText: { color: "#B5A99D", fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", marginTop: 30 },
  description: { color: "#9D9D9D", fontSize: 13, lineHeight: 19, marginTop: 8 },
  selectedCard: { backgroundColor: "#171717", borderRadius: 12, borderWidth: 1, borderColor: "#333333", padding: 16, marginTop: 18, marginBottom: 14 },
  selectedCaption: { color: "#999999", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  selectedValue: { color: ORANGE, fontSize: 24, fontWeight: "800", marginTop: 5 },
  saveState: { color: "#888888", fontSize: 11, marginTop: 5 },
  options: { borderRadius: 12, overflow: "hidden", borderColor: "#292929", borderWidth: 1 },
  option: { minHeight: 49, backgroundColor: "#121212", borderBottomColor: "#292929", borderBottomWidth: 1, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionActive: { backgroundColor: "#24170D" },
  optionText: { color: "#D0D0D0", fontSize: 14 },
  optionTextActive: { color: ORANGE, fontWeight: "700" },
  radio: { width: 19, height: 19, borderRadius: 10, borderColor: "#777777", borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: ORANGE },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: ORANGE },
  footer: { color: "#777777", fontSize: 11, lineHeight: 17, marginTop: 18 }
});
