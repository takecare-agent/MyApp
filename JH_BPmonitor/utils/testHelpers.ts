/**
 * 測試輔助工具與模擬數據
 * 用於本地測試和開發
 */

type BloodPressureSample = {
    sys: number;
    dia: number;
    pulse: number;
};

type AlertScenarioType = 'normal' | 'warning' | 'danger';

type APIResponseShape = Record<string, unknown>;

// ════════════════════════════════════════════════════════════════════════════
// 【模擬數據生成器】
// ════════════════════════════════════════════════════════════════════════════

export const MockDataGenerator = {
    /**
     * 生成隨機血壓數據
     */
    generateRandomBP: (
        minSys = 90,
        maxSys = 180,
        minDia = 60,
        maxDia = 120
    ) => {
        const sys = Math.floor(Math.random() * (maxSys - minSys + 1) + minSys);
        const dia = Math.floor(Math.random() * (maxDia - minDia + 1) + minDia);
        const pulse = Math.floor(Math.random() * 50 + 60); // 60-110 bpm

        return { sys, dia, pulse };
    },

    /**
     * 生成模擬最新血壓記錄
     */
    generateLatestBPRecord: () => {
        const { sys, dia, pulse } = MockDataGenerator.generateRandomBP();

        return {
            sys,
            dia,
            pulse,
            mood: ['正常', '開心', '平靜'][Math.floor(Math.random() * 3)],
            time: new Date().toISOString(),
            source: 'omron_bluetooth',
            status: sys >= 140 ? 'danger' : sys >= 120 ? 'warning' : 'normal'
        };
    },

    /**
     * 生成模擬統計數據（3個月或6個月）
     */
    generateStatistics: (months = 3) => {
        const days = months === 3 ? 90 : 180;
        const trendData = [];

        for (let i = days; i >= 0; i -= 7) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const [, month, day] = dateStr.split('-');

            trendData.push({
                date: dateStr,
                label: `${month}/${day}`,
                avgSys: 120 + Math.floor(Math.random() * 40 - 20),
                avgDia: 80 + Math.floor(Math.random() * 30 - 15)
            });
        }

        const allSys = trendData.map(d => d.avgSys);
        const allDia = trendData.map(d => d.avgDia);

        return {
            period: months === 3 ? '3m' : '6m',
            avgSystolic: Math.round(
                allSys.reduce((a, b) => a + b, 0) / allSys.length
            ),
            avgDiastolic: Math.round(
                allDia.reduce((a, b) => a + b, 0) / allDia.length
            ),
            maxSystolic: Math.max(...allSys),
            minSystolic: Math.min(...allSys),
            highBPDays: trendData.filter(d => d.avgSys >= 140).length,
            totalDays: trendData.length,
            trendData
        };
    },

    /**
     * 生成模擬今日狀態
     */
    generateTodayStatus: (hasMeasured = true) => {
        if (!hasMeasured) {
            return {
                measuredToday: false,
                latestRecord: null,
                totalMeasurements: 0,
                dailyStatus: {
                    morningMeasured: false,
                    afternoonMeasured: false,
                    eveningMeasured: false,
                    allCompleted: false
                }
            };
        }

        const { sys, dia, pulse } = MockDataGenerator.generateRandomBP();

        return {
            measuredToday: true,
            latestRecord: {
                sys,
                dia,
                pulse,
                time: new Date().toISOString()
            },
            totalMeasurements: 2,
            dailyStatus: {
                morningMeasured: true,
                afternoonMeasured: true,
                eveningMeasured: false,
                allCompleted: false
            }
        };
    },

    /**
     * 生成模擬7天歷史
     */
    generateSevenDayHistory: () => {
        const history = [];

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const dayLabel = ['日', '一', '二', '三', '四', '五', '六'][
                date.getDay()
            ];

            const hasRecord = Math.random() > 0.2; // 80% 有記錄
            const records = hasRecord
                ? Array(Math.floor(Math.random() * 3 + 1))
                    .fill(0)
                    .map(() => {
                        const { sys, dia, pulse } =
                            MockDataGenerator.generateRandomBP();
                        return {
                            sys,
                            dia,
                            pulse,
                            mood: '平靜',
                            time: new Date().toISOString()
                        };
                    })
                : [];

            let avgSys, avgDia;
            if (records.length > 0) {
                avgSys = Math.round(
                    records.reduce((sum, r) => sum + r.sys, 0) / records.length
                );
                avgDia = Math.round(
                    records.reduce((sum, r) => sum + r.dia, 0) / records.length
                );
            }

            history.push({
                date: dateStr,
                dayLabel,
                hasRecord,
                records,
                avgSys,
                avgDia
            });
        }

        return { history };
    }
};

// ════════════════════════════════════════════════════════════════════════════
// 【本地 API 模擬器】
// ════════════════════════════════════════════════════════════════════════════

export const LocalAPISimulator = {
    /**
     * 模擬 GET /api/bp/latest
     */
    simulateLatestBP: async (_userId: string) => {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(MockDataGenerator.generateLatestBPRecord());
            }, 500); // 模擬 500ms 網路延遲
        });
    },

    /**
     * 模擬 GET /api/bp/statistics
     */
    simulateStatistics: async (_userId: string, daysBack: number) => {
        return new Promise(resolve => {
            setTimeout(() => {
                const months = daysBack <= 90 ? 3 : 6;
                resolve(MockDataGenerator.generateStatistics(months));
            }, 800);
        });
    },

    /**
     * 模擬 GET /api/caregiver/today-status
     */
    simulateTodayStatus: async (_userId: string) => {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(MockDataGenerator.generateTodayStatus(true));
            }, 500);
        });
    },

    /**
     * 模擬 GET /api/caregiver/seven-day-history
     */
    simulateSevenDayHistory: async (_userId: string) => {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(MockDataGenerator.generateSevenDayHistory());
            }, 800);
        });
    },

    /**
     * 模擬 POST /api/caregiver/trigger-sync
     */
    simulateTriggerSync: async (_userId: string) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (Math.random() > 0.1) {
                    // 90% 成功率
                    const { sys, dia, pulse } =
                        MockDataGenerator.generateRandomBP();
                    resolve({
                        success: true,
                        message: '同步成功',
                        record: {
                            sys,
                            dia,
                            pulse,
                            time: new Date().toISOString()
                        }
                    });
                } else {
                    reject(new Error('藍牙連接失敗'));
                }
            }, 2000); // 模擬同步過程
        });
    },

    /**
     * 模擬 POST /api/bp/manual-record
     */
    simulateManualRecord: async (data: APIResponseShape) => {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    success: true,
                    message: '記錄成功',
                    record: {
                        _id: Math.random().toString(36).substring(7),
                        ...data,
                        time: new Date().toISOString()
                    }
                });
            }, 500);
        });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// 【測試場景】
// ════════════════════════════════════════════════════════════════════════════

export const TestScenarios = {
    /**
     * 場景 1：正常血壓
     */
    normalBP: () => ({
        sys: 120,
        dia: 80,
        pulse: 70
    }),

    /**
     * 場景 2：血壓前期（黃色警告）
     */
    elevatedBP: () => ({
        sys: 130,
        dia: 85,
        pulse: 75
    }),

    /**
     * 場景 3：高血壓（紅色警告）
     */
    highBP: () => ({
        sys: 145,
        dia: 95,
        pulse: 85
    }),

    /**
     * 場景 4：危險高血壓（需要立即就醫）
     */
    dangerousHighBP: () => ({
        sys: 180,
        dia: 120,
        pulse: 100
    }),

    /**
     * 場景 5：低血壓
     */
    lowBP: () => ({
        sys: 85,
        dia: 55,
        pulse: 50
    }),

    /**
     * 場景 6：高脈搏
     */
    highPulse: () => ({
        sys: 120,
        dia: 80,
        pulse: 110
    })
};

// ════════════════════════════════════════════════════════════════════════════
// 【開發工具函數】
// ════════════════════════════════════════════════════════════════════════════

export const DevTools = {
    /**
     * 啟用本地 API 模擬模式（用於本地開發）
     */
    enableLocalAPIMode: () => {
        console.log('🔧 已啟用本地 API 模擬模式');
        console.log('💡 提示：在真實應用前，請切換回真實 API');
    },

    /**
     * 禁用本地 API 模擬模式
     */
    disableLocalAPIMode: () => {
        console.log('🔧 已禁用本地 API 模擬模式，使用真實 API');
    },

    /**
     * 列出所有模擬數據
     */
    listMockData: () => {
        console.table({
            normalBP: TestScenarios.normalBP(),
            elevatedBP: TestScenarios.elevatedBP(),
            highBP: TestScenarios.highBP(),
            dangerousHighBP: TestScenarios.dangerousHighBP(),
            lowBP: TestScenarios.lowBP(),
            highPulse: TestScenarios.highPulse()
        });
    },

    /**
     * 模擬血壓異常警報
     */
    simulateAlertScenario: (type: AlertScenarioType) => {
        const scenarios: Record<AlertScenarioType, string> = {
            normal: '✅ 正常血壓',
            warning: '⚠️ 血壓異常警告',
            danger: '🚨 危險高血壓警報'
        };

        console.log(`[模擬] ${scenarios[type]}`);

        if (type === 'danger') {
            console.warn(
                '🚨 系統應彈出紅色警告橫幅，建議立即就醫'
            );
        } else if (type === 'warning') {
            console.warn('⚠️ 系統應彈出黃色警告，建議調整生活方式');
        } else {
            console.log('✅ 血壓正常，無需特殊處理');
        }
    },

    /**
     * 性能測試：模擬大量數據
     */
    performanceTest: async () => {
        const startedAt = Date.now();

        const largeDataset = Array(365)
            .fill(0)
            .map((_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - i);
                return {
                    date: date.toISOString().split('T')[0],
                    label: `${date.getMonth() + 1}/${date.getDate()}`,
                    avgSys: 120 + Math.floor(Math.random() * 40 - 20),
                    avgDia: 80 + Math.floor(Math.random() * 30 - 15)
                };
            });

        console.log(`已生成 ${largeDataset.length} 個數據點`);
        console.log(`圖表資料生成耗時 ${Date.now() - startedAt} ms`);

        return largeDataset;
    }
};

// ════════════════════════════════════════════════════════════════════════════
// 【單元測試輔助函數】
// ════════════════════════════════════════════════════════════════════════════

export const TestHelpers = {
    /**
     * 驗證血壓數據格式
     */
    validateBPData: (data: BloodPressureSample) => {
        const errors: string[] = [];

        if (typeof data.sys !== 'number' || data.sys < 0 || data.sys > 250) {
            errors.push('Invalid sys value');
        }
        if (typeof data.dia !== 'number' || data.dia < 0 || data.dia > 200) {
            errors.push('Invalid dia value');
        }
        if (
            typeof data.pulse !== 'number' ||
            data.pulse < 0 ||
            data.pulse > 200
        ) {
            errors.push('Invalid pulse value');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * 驗證 API 回應格式
     */
    validateAPIResponse: (response: APIResponseShape, expectedFields: string[]) => {
        const missing = expectedFields.filter((field: string) => !(field in response));

        return {
            valid: missing.length === 0,
            missingFields: missing
        };
    },

    /**
     * 模擬異步操作
     */
    simulateAsync: async (duration = 1000, shouldFail = false) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (shouldFail) {
                    reject(new Error('模擬異步操作失敗'));
                } else {
                    resolve({ success: true });
                }
            }, duration);
        });
    }
};

export default {
    MockDataGenerator,
    LocalAPISimulator,
    TestScenarios,
    DevTools,
    TestHelpers
};
