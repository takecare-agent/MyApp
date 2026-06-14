import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import DateRangePicker from '../components/DateRangePicker';
import { StackedBarChart, LineChartComponent, PieChartComponent } from '../components/Charts';

export default function AbnormalStatsScreen({ navigation }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'line' | 'pie'

  const fetchEvents = async () => {
    try {
      const response = await client.get('/api/abnormal-events');
      setEvents(response.data);
    } catch (error) {
      console.error("抓取異常失敗:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchEvents(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchEvents(); };

  // 过滤日期范围内的数据
  const filteredEvents = dateRange.start
    ? events.filter(e => {
        const d = new Date(e.createdAt);
        const start = new Date(dateRange.start);
        const end = dateRange.end ? new Date(dateRange.end) : new Date(dateRange.start);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        return d >= start && d <= end;
      })
    : events;

  // 统计
  const total = filteredEvents.length;
  const handled = filteredEvents.filter(e => e.isHandled).length;
  const unhandled = total - handled;
  const urgent = filteredEvents.filter(e => e.severity === '緊急').length;
  const notice = filteredEvents.filter(e => e.severity === '注意').length;
  const mild = filteredEvents.filter(e => e.severity === '輕微').length;

  // 按月统计 - 跌倒/受傷 和 生理異常
  const monthlyStats = filteredEvents.reduce((acc, e) => {
    const d = new Date(e.createdAt);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${month}`;
    if (!acc[key]) {
      acc[key] = {
        year,
        month,
        label: `${month}月`,
        total: 0,
        fall: 0,
        health: 0,
        emotion: 0,
        diet: 0,
        other: 0
      };
    }
    acc[key].total++;
    if (e.type === '跌倒/受傷') acc[key].fall++;
    else if (e.type === '生理異常') acc[key].health++;
    else if (e.type === '情緒/行為') acc[key].emotion++;
    else if (e.type === '飲食/排泄') acc[key].diet++;
    else acc[key].other++;
    return acc;
  }, {});

  // 按年月排序
  const monthlyData = Object.entries(monthlyStats)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12); // 最近12个月

  // 類型統計
  const typeCounts = filteredEvents.reduce((acc, e) => {
    const t = e.type || e.eventType || '未知';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  // 圓餅圖數據
  const pieData = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count], index) => ({
      label: type,
      value: count,
      color: ['#ff4d4f', '#1890ff', '#52c41a', '#faad14', '#722ed1', '#eb2f96'][index]
    }));

  // 準備堆疊柱狀圖的完整數據格式
  const stackedChartData = {
    labels: monthlyData.map(([key, data]) => data.label),
    datasets: [
      { data: monthlyData.map(d => d[1].fall), color: '#e74c3c', label: '跌倒/受傷' },
      { data: monthlyData.map(d => d[1].health), color: '#3498db', label: '生理異常' },
      { data: monthlyData.map(d => d[1].emotion), color: '#fa8c16', label: '情緒/行為' },
      { data: monthlyData.map(d => d[1].diet), color: '#52c41a', label: '飲食/排泄' },
      { data: monthlyData.map(d => d[1].other), color: '#8c8c8c', label: '其他' },
    ]
  };


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff4d4f" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>異常統計分析</Text>

      {/* 日期筛选 */}
      <View style={styles.filterCard}>
        <Text style={styles.filterLabel}><Ionicons name="calendar-outline" size={16} color="#595959" /> 選擇統計區間</Text>
        <DateRangePicker onRangeChange={setDateRange} />
      </View>

      {/* 总览卡片 */}
      <View style={styles.overviewRow}>
        <View style={[styles.overviewCard, { backgroundColor: '#fff2f0' }]}>
          <Text style={styles.overviewNum}>{total}</Text>
          <Text style={styles.overviewLabel}>總異常數</Text>
        </View>
        <View style={[styles.overviewCard, { backgroundColor: '#f6ffed' }]}>
          <Text style={[styles.overviewNum, { color: '#52c41a' }]}>{handled}</Text>
          <Text style={styles.overviewLabel}>已處理</Text>
        </View>
        <View style={[styles.overviewCard, { backgroundColor: '#fff7e6' }]}>
          <Text style={[styles.overviewNum, { color: '#faad14' }]}>{unhandled}</Text>
          <Text style={styles.overviewLabel}>未處理</Text>
        </View>
      </View>


      {/* 严重程度分布 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}><Ionicons name="alert-circle" size={18} color="#262626" /> 嚴重程度分布</Text>
        <View style={styles.severityRow}>
          <View style={[styles.severityCard, { borderColor: '#ff4d4f', backgroundColor: '#fff2f0' }]}>
            <Ionicons name="alert-circle" size={24} color="#ff4d4f" />
            <Text style={[styles.severityNum, { color: '#ff4d4f' }]}>{urgent}</Text>
            <Text style={styles.severityLabel}>緊急</Text>
          </View>
          <View style={[styles.severityCard, { borderColor: '#faad14', backgroundColor: '#fff7e6' }]}>
            <Ionicons name="warning" size={24} color="#faad14" />
            <Text style={[styles.severityNum, { color: '#faad14' }]}>{notice}</Text>
            <Text style={styles.severityLabel}>注意</Text>
          </View>
          <View style={[styles.severityCard, { borderColor: '#52c41a', backgroundColor: '#f6ffed' }]}>
            <Ionicons name="information-circle" size={24} color="#52c41a" />
            <Text style={[styles.severityNum, { color: '#52c41a' }]}>{mild}</Text>
            <Text style={styles.severityLabel}>輕微</Text>
          </View>
        </View>
      </View>

      {/* ✅ 處理率 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}><Ionicons name="checkmark-done-circle" size={18} color="#262626" /> 處理率</Text>
        <View style={styles.progressContainer}>
          <View style={styles.progressBg}>
            <View
              style={[
                styles.progressFill,
                { width: total > 0 ? `${(handled / total) * 100}%` : '0%' }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {total > 0 ? Math.round((handled / total) * 100) : 0}%
          </Text>
        </View>
        <Text style={styles.progressSub}>
          {handled} / {total} 筆已處理
        </Text>
      </View>


      {/* 📊 月度異常趨勢 - 可切換圖表 */}
      {monthlyData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}><Ionicons name="stats-chart" size={18} color="#262626" /> 月度異常趨勢</Text>

          {/* 圖表類型選擇 */}
          <View style={styles.chartToggle}>
            <TouchableOpacity
              style={[styles.chartToggleBtn, chartType === 'bar' && styles.chartToggleActive]}
              onPress={() => setChartType('bar')}
            >
              <Ionicons name="bar-chart" size={18} color={chartType === 'bar' ? '#fff' : '#595959'} />
              <Text style={[styles.chartToggleText, chartType === 'bar' && styles.chartToggleTextActive]}>長條圖</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chartToggleBtn, chartType === 'line' && styles.chartToggleActive]}
              onPress={() => setChartType('line')}
            >
              <Ionicons name="stats-chart" size={18} color={chartType === 'line' ? '#fff' : '#595959'} />
              <Text style={[styles.chartToggleText, chartType === 'line' && styles.chartToggleTextActive]}>折線圖</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chartToggleBtn, chartType === 'pie' && styles.chartToggleActive]}
              onPress={() => setChartType('pie')}
            >
              <Ionicons name="pie-chart" size={18} color={chartType === 'pie' ? '#fff' : '#595959'} />
              <Text style={[styles.chartToggleText, chartType === 'pie' && styles.chartToggleTextActive]}>圓餅圖</Text>
            </TouchableOpacity>
          </View>

          {/* 根據選擇顯示不同圖表 */}
          {chartType === 'bar' && (
            <StackedBarChart data={stackedChartData} height={280} />
          )}
          {chartType === 'line' && (
            <LineChartComponent
              data={monthlyData.map(([key, data]) => ({
                label: data.label,
                value: data.total
              }))}
              height={220}
            />
          )}
          {chartType === 'pie' && (
            <PieChartComponent data={pieData} height={220} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbfb' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fffbfb' },
  content: { padding: 16 },

  title: { fontSize: 22, fontWeight: 'bold', color: '#262626', marginBottom: 16, textAlign: 'center' },

  filterCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1 },
  filterLabel: { fontSize: 14, fontWeight: '600', color: '#595959', marginBottom: 10 },

  overviewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  overviewCard: { flex: 1, marginHorizontal: 4, padding: 15, borderRadius: 12, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1 },
  overviewNum: { fontSize: 28, fontWeight: 'bold', color: '#262626', marginTop: 8 },
  overviewLabel: { fontSize: 12, color: '#8c8c8c', marginTop: 4 },

  section: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#262626', marginBottom: 12 },

  severityRow: { flexDirection: 'row', justifyContent: 'space-around' },
  severityCard: { alignItems: 'center', borderRadius: 12, padding: 15, borderWidth: 2, minWidth: 90 },
  severityNum: { fontSize: 24, fontWeight: 'bold', marginTop: 8 },
  severityLabel: { fontSize: 13, color: '#595959', marginTop: 4 },

  typeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  typeRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ff4d4f', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  rankText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  typeName: { flex: 1, fontSize: 14, color: '#262626' },
  typeBarBg: { flex: 1, height: 12, backgroundColor: '#f0f0f0', borderRadius: 6, marginHorizontal: 8, overflow: 'hidden' },
  typeBar: { height: '100%', backgroundColor: '#ff4d4f', borderRadius: 6 },
  typeCount: { width: 30, textAlign: 'right', fontSize: 14, fontWeight: 'bold', color: '#ff4d4f' },

  progressContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressBg: { flex: 1, height: 16, backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#52c41a', borderRadius: 8 },
  progressText: { fontSize: 20, fontWeight: 'bold', color: '#52c41a', marginLeft: 12, width: 50 },
  progressSub: { fontSize: 12, color: '#8c8c8c', textAlign: 'center' },

  chartToggle: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#f0f0f0', borderRadius: 10, padding: 4 },
  chartToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
  chartToggleActive: { backgroundColor: '#1890ff' },
  chartToggleText: { fontSize: 13, color: '#595959', fontWeight: '500' },
  chartToggleTextActive: { color: '#fff', fontWeight: '600' },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12, gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  legendLabel: { fontSize: 12, color: '#595959' },

  empty: { textAlign: 'center', color: '#bfbfbf', fontSize: 14, marginTop: 20 }
});
