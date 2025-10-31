// src/hooks/useCryptoSocket.js

import { useState, useEffect, useCallback, useRef } from 'react'; 
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { calculateSMA } from '../utils/mathUtils'; 

const REST_API_URL = 'https://api.binance.com/api/v3/klines';

// ----------------------------------------------------
// Naya Logic: Data Cache (REST data store karne ke liye)
const dataCache = {}; 
// Note: Hook ke bahar ek simple JS object use kar rahe hain
// taaki cache across renders aur hook calls mein bana rahe.
// ----------------------------------------------------

export const useCryptoSocket = (symbol, interval) => {
    
    const WS_URL_CANDLE = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
    const WS_URL_TICKER = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`; 

    // Candlestick Connection
    const { lastMessage: candleMessage, readyState: candleReadyState } = useWebSocket(WS_URL_CANDLE); 
    // Live Ticker Connection
    const { lastMessage: tickerMessage } = useWebSocket(WS_URL_TICKER);

    const [candlestickData, setCandlestickData] = useState([]);
    const [movingAverages, setMovingAverages] = useState([]); 
    const [liveTickerPrice, setLiveTickerPrice] = useState(null); 
    const [isLoading, setIsLoading] = useState(true);

    const processKline = useCallback((k) => ({
        time: new Date(k[0]).getTime(), 
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        isFinal: k.length > 7 ? k[8] : true 
    }), []);
    
    // SMA Calculation Effect
    useEffect(() => {
        const closes = candlestickData.map(d => d.close);
        const sma20 = calculateSMA(closes, 20);
        setMovingAverages(sma20.slice(closes.length - candlestickData.length));
    }, [candlestickData]);


    // Initial Data Fetch (REST API) aur Caching Logic
    useEffect(() => {
        setIsLoading(true);
        setCandlestickData([]); 
        
        const cacheKey = `${symbol.toUpperCase()}_${interval}`;

        // 1. Cache Check
        if (dataCache[cacheKey]) {
            console.log(`[Cache Hit] Loading ${cacheKey} from cache.`);
            // Cache hit: Cached data load karein aur loading band karein
            setCandlestickData(dataCache[cacheKey]);
            setIsLoading(false);
            // WS connection automatically start ho chuka hai
            return; 
        }

        // 2. Cache Miss: Fetch Data
        console.log(`[Cache Miss] Fetching ${cacheKey} via REST API.`);

        const fetchInitialData = async () => {
            try {
                const response = await fetch(`${REST_API_URL}?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=100`);
                const data = await response.json();
                
                if (Array.isArray(data)) {
                    const initialCandles = data.map(processKline);
                    // Cache Miss: Data ko cache mein store karein
                    dataCache[cacheKey] = initialCandles; 
                    setCandlestickData(initialCandles);
                }
            } catch (error) {
                console.error("Error fetching initial kline data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitialData();
        
    }, [symbol, interval, processKline]); 

    // Live Candlestick Update (WebSocket)
    useEffect(() => {
        if (candleMessage !== null && typeof candleMessage.data === 'string') {
            try {
                const streamData = JSON.parse(candleMessage.data);
                const kline = streamData.k;

                if (kline) {
                    const newCandle = processKline(kline); 

                    setCandlestickData(prevData => {
                        if (!newCandle.isFinal && prevData.length > 0) {
                            const updatedData = [...prevData];
                            updatedData[updatedData.length - 1] = newCandle;
                            // WS update ke baad, cache ko bhi update karein taaki data taza rahe
                            const cacheKey = `${symbol.toUpperCase()}_${interval}`;
                            dataCache[cacheKey] = updatedData;
                            return updatedData;
                        } 
                        else if (newCandle.isFinal || prevData.length === 0) {
                            if (prevData.length === 0 || prevData[prevData.length - 1].time !== newCandle.time) {
                                const newData = [...prevData, newCandle].slice(-100);
                                const cacheKey = `${symbol.toUpperCase()}_${interval}`;
                                dataCache[cacheKey] = newData; // Cache update
                                return newData; 
                            }
                        }
                        return prevData;
                    });
                }
            } catch (error) {
                console.error("Error parsing Candlestick message:", error);
            }
        }
    }, [candleMessage, processKline, symbol, interval]); // Dependency mein symbol aur interval jodne se WS update bhi cache ko sahi se update kar paayega
    
    // Live Ticker Price Update
    useEffect(() => {
        if (tickerMessage !== null && typeof tickerMessage.data === 'string') {
            try {
                const tradeData = JSON.parse(tickerMessage.data);
                if (tradeData.p) {
                    setLiveTickerPrice(parseFloat(tradeData.p));
                }
            } catch (error) {
                console.error("Error parsing Ticker message:", error);
            }
        }
    }, [tickerMessage]);
    

    const latestPrice = candlestickData.length > 0 ? candlestickData[candlestickData.length - 1].close : null;
    
    return { candlestickData, latestPrice, readyState: candleReadyState, isLoading, movingAverages, liveTickerPrice };
};
