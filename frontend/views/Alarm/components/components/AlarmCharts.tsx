import React from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";

// ------------------------------------------------------------------
// 报警趋势折线图（近15天）
// ------------------------------------------------------------------
export function AlarmTrendChart({
    data,
}: {
    data: { date: string; warning: number; alarm: number }[];
}) {
    const option = {
        tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(8,20,46,0.92)",
            borderColor: "#3b82f6",
            textStyle: { color: "#fff", fontSize: 12 },
        },
        legend: {
            top: 4,
            right: 10,
            textStyle: { color: "#94a3b8", fontSize: 11 },
            icon: "circle",
            itemWidth: 8,
            itemGap: 16,
        },
        grid: { left: "3%", right: "4%", bottom: "5%", top: "22%", containLabel: true },
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: data.map((d) => d.date),
            axisLabel: { color: "#64748b", fontSize: 10, rotate: 30 },
            axisLine: { lineStyle: { color: "#1e3a5f" } },
        },
        yAxis: {
            type: "value",
            axisLabel: { color: "#64748b", fontSize: 11 },
            splitLine: { lineStyle: { color: "rgba(59,130,246,0.08)", type: "dashed" } },
        },
        series: [
            {
                name: "预警",
                type: "line",
                smooth: true,
                lineStyle: {
                    color: "#f59e0b",
                    width: 2,
                    shadowColor: "rgba(245,158,11,0.5)",
                    shadowBlur: 10,
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(245,158,11,0.30)" },
                        { offset: 1, color: "rgba(245,158,11,0)" },
                    ]),
                },
                symbolSize: 5,
                itemStyle: { color: "#f59e0b" },
                data: data.map((d) => d.warning),
            },
            {
                name: "报警",
                type: "line",
                smooth: true,
                lineStyle: {
                    color: "#ef4444",
                    width: 2,
                    shadowColor: "rgba(239,68,68,0.5)",
                    shadowBlur: 10,
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(239,68,68,0.25)" },
                        { offset: 1, color: "rgba(239,68,68,0)" },
                    ]),
                },
                symbolSize: 5,
                itemStyle: { color: "#ef4444" },
                data: data.map((d) => d.alarm),
            },
        ],
    };

    return <ReactECharts option={option} style={{ width: "100%", height: "100%" }} />;
}

// ------------------------------------------------------------------
// 报警类型分布（环形图，中心显示总数）
// ------------------------------------------------------------------
export function AlarmTypeDonut({
    data,
    total,
}: {
    data: { name: string; value: number }[];
    total: number;
}) {
    const colors = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899"];
    const option = {
        tooltip: {
            trigger: "item",
            backgroundColor: "rgba(8,20,46,0.92)",
            borderColor: "#3b82f6",
            textStyle: { color: "#fff" },
            formatter: "{b}: {c} ({d}%)",
        },
        legend: {
            bottom: 0,
            textStyle: { color: "#94a3b8", fontSize: 10 },
            icon: "circle",
            itemWidth: 8,
            itemGap: 10,
        },
        series: [
            {
                type: "pie",
                radius: ["48%", "72%"],
                center: ["50%", "42%"],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 6,
                    borderColor: "rgba(8,20,46,0.5)",
                    borderWidth: 2,
                },
                label: { show: false },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 13,
                        fontWeight: "bold",
                        color: "#fff",
                    },
                    scaleSize: 6,
                },
                labelLine: { show: false },
                data,
                color: colors,
            },
            // 中心文字
            {
                type: "pie",
                radius: [0, 0],
                center: ["50%", "42%"],
                label: {
                    show: true,
                    position: "center",
                    formatter: () => `{total|${total}}\n{label|报警总数}`,
                    rich: {
                        total: {
                            fontSize: 28,
                            fontWeight: 800,
                            color: "#60a5fa",
                            fontFamily: "'Orbitron', 'Consolas', monospace",
                            textShadow: "0 0 12px rgba(96,165,250,0.6)",
                            lineHeight: 36,
                        },
                        label: {
                            fontSize: 11,
                            color: "#94a3b8",
                            lineHeight: 18,
                        },
                    },
                },
                data: [{ value: 0 }],
                silent: true,
            },
        ],
    };

    return <ReactECharts option={option} style={{ width: "100%", height: "100%" }} />;
}

// ------------------------------------------------------------------
// 报警级别分布（南丁格尔玫瑰图）
// ------------------------------------------------------------------
export function AlarmLevelRose({
    data,
}: {
    data: { name: string; value: number; color: string }[];
}) {
    const option = {
        tooltip: {
            trigger: "item",
            backgroundColor: "rgba(8,20,46,0.92)",
            textStyle: { color: "#fff" },
        },
        series: [
            {
                type: "pie",
                radius: [20, "75%"],
                center: ["50%", "50%"],
                roseType: "area",
                itemStyle: { borderRadius: 6 },
                label: {
                    show: true,
                    color: "#94a3b8",
                    fontSize: 11,
                    formatter: "{b}\n{c}",
                },
                data: data.map((d) => ({
                    value: d.value || 0,
                    name: d.name,
                    itemStyle: { color: d.color },
                })),
            },
        ],
    };

    return <ReactECharts option={option} style={{ width: "100%", height: "100%" }} />;
}

// ------------------------------------------------------------------
// 设备报警 TOP5 横向柱状图
// ------------------------------------------------------------------
export function DeviceTop5Bar({
    data,
}: {
    data: { device: string; count: number }[];
}) {
    const sorted = [...data].sort((a, b) => a.count - b.count).slice(-5);

    const option = {
        tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(8,20,46,0.92)",
            textStyle: { color: "#fff" },
        },
        grid: { left: "3%", right: "12%", bottom: "3%", top: "3%", containLabel: true },
        xAxis: {
            type: "value",
            axisLabel: { color: "#64748b", fontSize: 10 },
            splitLine: { lineStyle: { color: "rgba(59,130,246,0.08)", type: "dashed" } },
        },
        yAxis: {
            type: "category",
            data: sorted.map((d) => d.device),
            axisLabel: {
                color: "#94a3b8",
                fontSize: 10,
                width: 80,
                overflow: "truncate",
            },
            axisLine: { lineStyle: { color: "#1e3a5f" } },
        },
        series: [
            {
                type: "bar",
                barWidth: 14,
                itemStyle: {
                    borderRadius: [0, 4, 4, 0],
                    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                        { offset: 0, color: "#3b82f6" },
                        { offset: 1, color: "#06b6d4" },
                    ]),
                    shadowColor: "rgba(59,130,246,0.4)",
                    shadowBlur: 8,
                },
                label: {
                    show: true,
                    position: "right",
                    color: "#60a5fa",
                    fontSize: 11,
                    fontWeight: "bold",
                },
                data: sorted.map((d) => d.count),
            },
        ],
    };

    return <ReactECharts option={option} style={{ width: "100%", height: "100%" }} />;
}

// ------------------------------------------------------------------
// 处置效率仪表盘
// ------------------------------------------------------------------
export function ResolveRateGauge({ rate }: { rate: number }) {
    const option = {
        series: [
            {
                type: "gauge",
                startAngle: 220,
                endAngle: -40,
                min: 0,
                max: 100,
                splitNumber: 5,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                        { offset: 0, color: "#10b981" },
                        { offset: 0.7, color: "#3b82f6" },
                        { offset: 1, color: "#06b6d4" },
                    ]),
                    shadowColor: "rgba(16,185,129,0.6)",
                    shadowBlur: 15,
                },
                progress: { show: true, width: 14, roundCap: true },
                pointer: {
                    length: "55%",
                    width: 5,
                    itemStyle: { color: "#60a5fa" },
                },
                axisLine: {
                    lineStyle: {
                        width: 14,
                        color: [[1, "rgba(59,130,246,0.08)"]],
                        cap: "round",
                    },
                },
                axisTick: {
                    distance: -22,
                    lineStyle: { color: "rgba(96,165,250,0.3)", width: 1 },
                },
                splitLine: {
                    distance: -26,
                    length: 10,
                    lineStyle: { color: "rgba(96,165,250,0.4)", width: 2 },
                },
                axisLabel: {
                    distance: -16,
                    color: "#64748b",
                    fontSize: 10,
                    formatter: (v: number) => `${v}%`,
                },
                title: {
                    show: true,
                    offsetCenter: [0, "70%"],
                    color: "#94a3b8",
                    fontSize: 12,
                },
                detail: {
                    valueAnimation: true,
                    offsetCenter: [0, "40%"],
                    fontSize: 28,
                    fontWeight: "bolder",
                    color: "#10b981",
                    fontFamily: "'Orbitron', 'Consolas', monospace",
                    formatter: "{value}%",
                },
                data: [{ value: Math.round(rate), name: "处置率" }],
            },
        ],
    };

    return <ReactECharts option={option} style={{ width: "100%", height: "100%" }} />;
}
