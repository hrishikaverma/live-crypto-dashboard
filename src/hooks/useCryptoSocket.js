// src/hooks/useCryptoSocket.js

import { useState, useEffect, useRef } from 'react';
import useWebSocket from 'react-use-websocket';

// Hook ab 'symbol' ko argument ke roop mein lega
export const useCryptoSocket = (symbol) => { 
    
    // Naya WebSocket URL banao based on the symbol
    const WS_URL = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`;

    // Jab 'symbol' change hoga, toh useWebSocket naya connection banayega
    const { lastMessage, readyState } = useWebSocket(WS_URL); 
    
    // Jab naya coin select hoga, toh purana data reset hona chahiye
    const [latestPrice, setLatestPrice] = useState(null);
    const [chartData, setChartData] = useState([]);
    const dataBuffer = useRef([]);

    // --- Data Reset Logic (Crucial) ---
    // Jab bhi symbol badlega, hum chart data aur price ko reset kar denge
    useEffect(() => {
        console.log(`Switching to new symbol: ${symbol}`);
        setLatestPrice(null);
        setChartData([]);
        dataBuffer.current = [];
    }, [symbol]); // Yeh effect sirf 'symbol' change hone par run hoga

    // --- Real-Time Data Processing (Same as before) ---
    useEffect(() => {
        if (lastMessage !== null) {
            try {
                const data = JSON.parse(lastMessage.data);
                const price = parseFloat(data.p); 
                const timestamp = new Date(data.E).toLocaleTimeString(); 

                setLatestPrice(price);
                dataBuffer.current.push({ price, time: timestamp });

            } catch (error) {
                console.error("Error parsing Binance message:", error);
            }
        }
    }, [lastMessage]); 

    // --- Data Batching (Same as before) ---
    // ... (Interval logic yahan same rahegi) ...
    // Note: Is logic ko update karne ki zarurat nahi hai agar aapne pehle likha hai.

    // Batch Update Timer - Performance optimization
    useEffect(() => {
        const interval = setInterval(() => {
            if (dataBuffer.current.length > 0) {
                const newPoints = dataBuffer.current;
                setChartData(prevData => {
                    const updatedData = [...prevData, ...newPoints];
                    return updatedData.slice(-50); 
                });
                dataBuffer.current = []; 
            }
        }, 250); 

        return () => clearInterval(interval); 
    }, []);

    return { latestPrice, chartData, readyState };
};