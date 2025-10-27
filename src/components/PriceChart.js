// src/components/PriceChart.js

import React from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';

// Chart.js ke zaroori modules ko register karein
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

const PriceChart = ({ chartData }) => {
    // 1. Data ko Chart.js format mein convert karein
    const data = {
        // Labels (X-axis) mein time aayega
        labels: chartData.map(d => d.time), 
        datasets: [
            {
                label: 'BTC/USDT Live Price',
                // Data (Y-axis) mein price aayega
                data: chartData.map(d => d.price), 
                fill: false,
                backgroundColor: 'rgba(75, 192, 192, 0.4)',
                borderColor: 'rgba(75, 192, 192, 1)',
                pointRadius: 0, // Points nahi dikhayenge for cleaner look
                tension: 0.1, // Line ko smooth karein
            },
        ],
    };

    // 2. Chart Options define karein
    const options = {
        responsive: true,
        maintainAspectRatio: false, // Taki aap custom size de saken
        animation: false, // Real-time data mein animation band karein
        scales: {
            x: {
                // X-axis par sirf 5 labels dikhao, bahut saare time stamps se bachne ke liye
                ticks: {
                    maxTicksLimit: 5 
                },
            },
            y: {
                // Y-axis ko dynamic rakhne ke liye settings
                beginAtZero: false,
            },
        },
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: true,
                text: 'Live Price Trend (Last 50 Trades)',
            },
        },
    };

    // Agar data nahi hai toh loading message dikhayein
    if (chartData.length === 0) {
        return <p>Waiting for first batch of live data...</p>;
    }

    return (
        <div style={{ height: '400px', width: '100%' }}>
            <Line data={data} options={options} />
        </div>
    );
};

export default PriceChart;