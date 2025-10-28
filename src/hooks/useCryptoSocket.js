// src/hooks/useCryptoSocket.js

import { useState, useEffect } from 'react'; 
import useWebSocket from 'react-use-websocket';

// REST API endpoint (Binance)
const REST_API_URL = 'https://api.binance.com/api/v3/klines';

// Hook ab symbol aur interval (e.g., '1m', '5m') dono leta hai
export const useCryptoSocket = (symbol, interval) => {
    
    // WebSocket URL ko interval ke saath dynamic banaya gaya
    const WS_URL = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;

    // react-use-websocket by default auto-reconnection handle karta hai.
    const { lastMessage, readyState } = useWebSocket(WS_URL); 
    
    const [candlestickData, setCandlestickData] = useState([]);
    const [isLoading, setIsLoading] = useState(true); // Initial data loading state

    // Helper function to process raw kline data (includes volume)
    const processKline = (k) => ({
        // Binance kline data format: [openTime, open, high, low, close, volume, closeTime, ...]
        time: new Date(k[0]).toLocaleTimeString(), 
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]), // Volume data extracted
        // kline.x is at index 8 for WebSocket streams
        isFinal: k.length > 7 ? k[8] : true 
    });

    // 1. Initial Data Fetch (REST API)
    useEffect(() => {
        setIsLoading(true);
        setCandlestickData([]); // Clear old data

        const fetchInitialData = async () => {
            try {
                // Fetch pichhle 100 Candlesticks ka data
                const response = await fetch(`${REST_API_URL}?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=100`);
                const data = await response.json();
                
                if (Array.isArray(data)) {
                    const initialCandles = data.map(processKline);
                    setCandlestickData(initialCandles);
                } else {
                    console.error("Invalid data structure from REST API:", data);
                }
            } catch (error) {
                console.error("Error fetching initial kline data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitialData();
        
    }, [symbol, interval]); 

    // 2. Live Data Processing (WebSocket)
    useEffect(() => {
        if (lastMessage !== null && typeof lastMessage.data === 'string') {
            try {
                const streamData = JSON.parse(lastMessage.data);
                const kline = streamData.k;

                if (kline) {
                    const newCandle = processKline(kline); 

                    setCandlestickData(prevData => {
                        // Agar candle open hai, toh last candle ko update karo
                        if (!newCandle.isFinal && prevData.length > 0) {
                            const updatedData = [...prevData];
                            updatedData[updatedData.length - 1] = newCandle;
                            return updatedData;
                        } 
                        // Agar candle closed hai ya naya candle hai, toh use add karo
                        else if (newCandle.isFinal || prevData.length === 0) {
                            if (prevData.length === 0 || prevData[prevData.length - 1].time !== newCandle.time) {
                                return [...prevData, newCandle].slice(-100); 
                            }
                        }
                        return prevData;
                    });
                }
            } catch (error) {
                console.error("Error parsing Candlestick message:", error);
            }
        }
    }, [lastMessage]); 

    const latestPrice = candlestickData.length > 0 ? candlestickData[candlestickData.length - 1].close : null;
    
    return { candlestickData, latestPrice, readyState, isLoading };
};
