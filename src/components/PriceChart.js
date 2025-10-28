// src/components/PriceChart.js

import React from 'react';
// Chart Types: Candlestick and Bar (for Volume)
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
// Core Chart.js modules and Line components (for SMA)
import { Chart as ChartJS, LinearScale, Tooltip, TimeScale, TimeSeriesScale, BarController, BarElement, LineController, PointElement, LineElement } from 'chart.js';
import 'chartjs-adapter-date-fns'; 
import { Chart } from 'react-chartjs-2'; 

// Modules registration is crucial for Chart.js to work correctly
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
    BarElement,
    // SMA registration
    LineController, 
    PointElement,   
    LineElement     
);

// candlestickData aur movingAverages props receive kiye ja rahe hain
const CandlestickChart = ({ candlestickData, movingAverages }) => {
    
    // Data ko Chart.js datasets ke liye prepare karna
    const chartData = {
        // Labels mein time stamp (Date object) use hoga for TimeSeries scale
        datasets: [
            // 1. Candlestick Dataset (Main Chart)
            {
                label: 'Price',
                // Data ko Date object mein convert karein
                data: candlestickData.map(d => ({...d, time: new Date(d.time)})), 
                type: 'candlestick', 
                barThickness: 10,
                yAxisID: 'yPrice', // Main Price Axis
                borderColor: (context) => context.raw.open < context.raw.close ? 'green' : 'red', 
                color: (context) => context.raw.open < context.raw.close ? 'green' : 'red',
            },
            // 2. Volume Dataset (Bar Chart)
            {
                label: 'Volume',
                // Volume data: x-axis time, y-axis volume
                data: candlestickData.map(d => ({ x: new Date(d.time), y: d.volume, open: d.open, close: d.close })),
                type: 'bar',
                yAxisID: 'yVolume', // Separate Volume Axis
                backgroundColor: (context) => context.raw.open < context.raw.close ? 'rgba(0, 128, 0, 0.4)' : 'rgba(255, 0, 0, 0.4)',
                borderWidth: 0,
            },
            // 3. Moving Average Dataset (Line Chart) - SMA 20
            {
                label: 'SMA 20',
                data: movingAverages.map((sma, index) => ({
                    // Time axis ke liye Candlestick data se time uthao
                    x: new Date(candlestickData[index].time), 
                    y: sma 
                })).filter(d => d.y !== undefined), // Initial undefined/null SMA values ko ignore karein
                type: 'line', 
                yAxisID: 'yPrice',
                borderColor: '#FFD700', // Gold color
                borderWidth: 2,
                pointRadius: 0, 
                tension: 0.1, 
                fill: false,
            }
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        // Chart options
        scales: {
            x: {
                type: 'timeseries', 
                time: {
                    unit: 'minute',
                    tooltipFormat: 'MMM D, h:mm a'
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
                position: 'right', 
                grid: { drawOnChartArea: false }, 
                title: { display: true, text: 'Volume' },
                // Max volume calculate karein for dynamic scaling
                max: Math.max(...candlestickData.map(d => d.volume || 0)) * 1.5,
                min: 0,
            }
        },
        plugins: {
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    title: (context) => `Time: ${new Date(context[0].parsed.x).toLocaleTimeString()}`,
                    label: (context) => {
                        // Tooltip mein Candlestick, Volume, aur SMA data ko dikhana
                        if (context.datasetIndex === 0 && context.raw) {
                            return [
                                `Open: $${context.raw.open.toFixed(4)}`,
                                `High: $${context.raw.high.toFixed(4)}`,
                                `Low: $${context.raw.low.toFixed(4)}`,
                                `Close: $${context.raw.close.toFixed(4)}`
                            ];
                        } 
                        else if (context.datasetIndex === 1) {
                             return `Volume: ${context.raw.y.toFixed(2)}`;
                        }
                        else if (context.datasetIndex === 2) {
                             return `SMA 20: ${context.raw.y ? context.raw.y.toFixed(4) : 'N/A'}`;
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

    // Chart ko ek fixed height container mein wrap karein
    return (
        <div style={{ height: '450px', width: '100%' }}>
            <Chart data={chartData} options={options} /> 
        </div>
    );
};

export default CandlestickChart;
