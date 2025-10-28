// src/components/PriceChart.js

import React from 'react';
// Candlestick aur Bar chart types ke liye import
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
// FIX: Sabhi zaruri scales, controllers aur elements ko import karein
import { Chart as ChartJS, LinearScale, Tooltip, TimeScale, TimeSeriesScale, BarController, BarElement } from 'chart.js';
import 'chartjs-adapter-date-fns'; // Time-series adapter
import { Chart } from 'react-chartjs-2'; 

// FIX: Modules ko register karein
ChartJS.register(
    TimeScale,
    TimeSeriesScale,
    LinearScale, 
    Tooltip,
    // Candlestick registration
    CandlestickController,
    CandlestickElement,
    // Volume registration
    BarController, 
    BarElement     
);

const CandlestickChart = ({ candlestickData }) => {
    
    // Data ko Candlestick aur Volume datasets mein structure karna
    const chartData = {
        // Labels mein time string pass ho raha hai
        labels: candlestickData.map(d => d.time), 
        datasets: [
            // 1. Candlestick Dataset (Main Chart)
            {
                label: 'Price',
                data: candlestickData,
                type: 'candlestick', 
                barThickness: 10,
                yAxisID: 'yPrice', // Main Price Axis
                // Candlestick colors based on OHLC
                borderColor: (context) => context.raw.open < context.raw.close ? 'green' : 'red', 
                color: (context) => context.raw.open < context.raw.close ? 'green' : 'red',
            },
            // 2. Volume Dataset (Bar Chart)
            {
                label: 'Volume',
                // Data mein volume aur OHLC info shamil karein (color decision ke liye)
                data: candlestickData.map(d => ({ x: d.time, y: d.volume, open: d.open, close: d.close })),
                type: 'bar',
                yAxisID: 'yVolume', // Separate Volume Axis
                // Volume bar colors (matching candlestick color)
                backgroundColor: (context) => context.raw.open < context.raw.close ? 'rgba(0, 128, 0, 0.4)' : 'rgba(255, 0, 0, 0.4)',
                borderWidth: 0,
            }
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        // Y-axis parsing ab sirf Candlestick data ke liye hai
        parsing: {
            xAxisKey: 'time',
            yAxisKey: ['open', 'high', 'low', 'close'] 
        },
        scales: {
            x: {
                type: 'timeseries', 
                time: {
                    unit: 'minute',
                    displayFormats: {
                        minute: 'h:mm:ss a'
                    }
                },
                title: { display: true, text: 'Time' },
            },
            // Main Price Axis (Left side)
            yPrice: {
                position: 'left',
                title: { display: true, text: 'Price (USDT)' },
                grid: { borderColor: 'rgba(200, 200, 200, 0.2)' },
            },
            // Volume Axis (Right side, Hidden Grid)
            yVolume: {
                position: 'right', // Right side par dikhega
                // Volume bars ko Price Chart ke peeche banane se rokein
                grid: { drawOnChartArea: false }, 
                title: { display: true, text: 'Volume' },
                // Volume scale ko auto-adjust karein
                max: Math.max(...candlestickData.map(d => d.volume)) * 1.5, 
                min: 0,
            }
        },
        plugins: {
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    // Tooltip title
                    title: (context) => `Time: ${context[0].label}`,
                    label: (context) => {
                        // Candlestick data
                        if (context.datasetIndex === 0 && context.raw) {
                            return [
                                `Open: $${context.raw.open.toFixed(4)}`,
                                `High: $${context.raw.high.toFixed(4)}`,
                                `Low: $${context.raw.low.toFixed(4)}`,
                                `Close: $${context.raw.close.toFixed(4)}`
                            ];
                        } 
                        // Volume data
                        else if (context.datasetIndex === 1) {
                             return `Volume: ${context.raw.y.toFixed(2)}`;
                        }
                        return '';
                    }
                }
            }
        }
    };

    if (candlestickData.length === 0) {
        return <p>Loading initial data...</p>;
    }

    // Chart type ab default (candlestick) nahi hai, isliye type property ko 'Chart' component se hatana hoga
    return (
        <div style={{ height: '450px', width: '100%' }}>
            <Chart data={chartData} options={options} /> 
        </div>
    );
};

export default CandlestickChart;
