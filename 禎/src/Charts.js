import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart, PieChart } from 'react-native-chart-kit';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 40;

// 折線圖
export const LineChartComponent = ({ data, height = 220, color = '#ff4d4f', title = '' }) => {
  if (!data || data.length === 0) {
    return <Text style={styles.noData}>暫無數據</Text>;
  }

  const labels = data.map(d => d.label);
  const values = data.map(d => d.value);

  return (
    <View style={styles.chartWrapper}>
      {title ? <Text style={styles.chartTitle}>{title}</Text> : null}
      <LineChart
        data={{
          labels: labels,
          datasets: [{ data: values }]
        }}
        width={CHART_WIDTH}
        height={height}
        yAxisLabel=""
        yAxisSuffix=""
        chartConfig={{
          backgroundColor: '#fff',
          backgroundGradientFrom: '#fff',
          backgroundGradientTo: '#fff',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(255, 77, 79, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(89, 89, 89, ${opacity})`,
          style: { borderRadius: 16 },
          propsForDots: {
            r: '5',
            strokeWidth: '2',
            stroke: '#ff4d4f'
          },
          propsForBackgroundLines: {
            strokeDasharray: '',
            stroke: '#f0f0f0'
          }
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );
};

// 自定義堆疊柱狀圖
export const StackedBarChart = ({ data, height = 280, title = '' }) => {
  if (!data || !data.labels || data.labels.length === 0) {
    return <Text style={styles.noData}>暫無數據</Text>;
  }

  const categories = [
    { label: '跌倒/受傷', color: '#e74c3c', key: 'fall' },
    { label: '生理異常', color: '#3498db', key: 'health' },
    { label: '情緒/行為', color: '#fa8c16', key: 'emotion' },
    { label: '飲食/排泄', color: '#52c41a', key: 'diet' },
    { label: '其他', color: '#8c8c8c', key: 'other' },
  ];

  // 計算每月的最大值用於高度比例
  const monthlyMax = data.labels.map((_, monthIndex) => {
    return categories.reduce((sum, cat) => {
      const value = data.datasets.find(d => d.label === cat.label)?.data[monthIndex] || 0;
      return sum + value;
    }, 0);
  });

  const maxValue = Math.max(...monthlyMax, 1);
  const chartHeight = height - 60;

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.chartTitle}>{title}</Text> : null}

      {/* 圖表區域 */}
      <View style={[styles.chartArea, { height: chartHeight }]}>
        {/* Y軸刻度 */}
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>{maxValue}</Text>
          <Text style={styles.axisLabel}>{Math.round(maxValue / 2)}</Text>
          <Text style={styles.axisLabel}>0</Text>
        </View>

        {/* 柱子區域 */}
        <View style={styles.barsContainer}>
          {data.labels.map((label, monthIndex) => {
            const monthData = categories.map(cat => {
              const dataset = data.datasets.find(d => d.label === cat.label);
              return dataset?.data[monthIndex] || 0;
            });

            const total = monthData.reduce((a, b) => a + b, 0);
            if (total === 0) return null;

            return (
              <View key={monthIndex} style={styles.barColumn}>
                {/* 堆疊柱子 */}
                <View style={[styles.barStack, { height: chartHeight - 30 }]}>
                  {categories.map((cat, catIndex) => {
                    const value = monthData[catIndex];
                    if (value === 0) return null;
                    const heightPercent = (value / maxValue) * (chartHeight - 30);

                    return (
                      <View
                        key={cat.key}
                        style={[
                          styles.barSegment,
                          {
                            height: heightPercent,
                            backgroundColor: cat.color,
                          }
                        ]}
                      >
                        {value > 0 && (
                          <Text style={styles.barValue}>{value}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                {/* X軸標籤 */}
                <Text style={styles.xLabel} numberOfLines={1}>{label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* 圖例 */}
      <View style={styles.legend}>
        {categories.map((cat) => (
          <View key={cat.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
            <Text style={styles.legendLabel}>{cat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// 圓餅圖
export const PieChartComponent = ({ data, height = 240, title = '' }) => {
  if (!data || data.length === 0) {
    return <Text style={styles.noData}>暫無數據</Text>;
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return <Text style={styles.noData}>暫無數據</Text>;
  }

  const chartData = data.map((item, index) => ({
    name: item.label,
    population: item.value,
    color: item.color,
    legendFontColor: '#595959',
    legendFontSize: 12
  }));

  return (
    <View style={styles.pieContainer}>
      {title ? <Text style={styles.chartTitle}>{title}</Text> : null}
      <PieChart
        data={chartData}
        width={CHART_WIDTH}
        height={height}
        chartConfig={{
          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
        }}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="15"
        absolute
      />
    </View>
  );
};

const styles = StyleSheet.create({
  noData: { textAlign: 'center', color: '#bfbfbf', fontSize: 14, padding: 20 },
  container: { paddingVertical: 10 },
  chartWrapper: { paddingVertical: 10 },
  chartTitle: { fontSize: 14, fontWeight: '600', color: '#595959', marginBottom: 12 },
  chart: { marginVertical: 8, borderRadius: 16 },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end' },
  yAxis: { width: 35, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 8, height: '100%' },
  axisLabel: { fontSize: 10, color: '#8c8c8c' },
  barsContainer: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', height: '100%' },
  barColumn: { alignItems: 'center', flex: 1 },
  barStack: { width: '70%', flexDirection: 'column-reverse', justifyContent: 'flex-start' },
  barSegment: { width: '100%', justifyContent: 'center', alignItems: 'center', minHeight: 15 },
  barValue: { fontSize: 9, color: '#fff', fontWeight: 'bold' },
  xLabel: { fontSize: 10, color: '#595959', marginTop: 6, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 16, gap: 12 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 16, gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  legendLabel: { fontSize: 12, color: '#595959' },
  pieContainer: { paddingVertical: 10 }
});
