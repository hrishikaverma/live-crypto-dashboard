import { useState, useEffect, useCallback } from 'react'; 
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { calculateSMA } from '../utils/mathUtils'; // FIX: Naye util function ke liye import

const REST_API_URL = 'https://api.binance.com/api/v3/klines';

export const useCryptoSocket = (symbol, interval) => {
    
    // 1. Candlestick WebSocket URL
    const WS_URL_CANDLE = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
    // 2. Live Price WebSocket URL (Symbol Ticker)
    const WS_URL_TICKER = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`; 

    // Candlestick Connection (kline)
    const { lastMessage: candleMessage, readyState: candleReadyState } = useWebSocket(WS_URL_CANDLE); 
    // Live Ticker Connection (trade)
    const { lastMessage: tickerMessage } = useWebSocket(WS_URL_TICKER);

    const [candlestickData, setCandlestickData] = useState([]);
    const [movingAverages, setMovingAverages] = useState([]); // SMA data
    const [liveTickerPrice, setLiveTickerPrice] = useState(null); // Live Ticker Price
    const [isLoading, setIsLoading] = useState(true);

    const processKline = useCallback((k) => ({
        time: new Date(k[0]).getTime(), // Time as number (for SMA calculation)
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        isFinal: k.length > 7 ? k[8] : true 
    }), []);
    
    // 3. SMA Calculation Effect
    useEffect(() => {
        // SMA 20 calculate karein (20 periods ka average)
        const closes = candlestickData.map(d => d.close);
        const sma20 = calculateSMA(closes, 20);
        setMovingAverages(sma20.slice(closes.length - candlestickData.length)); // Ensure lengths match
    }, [candlestickData]);


    // 4. Initial Data Fetch (REST API)
    useEffect(() => {
        setIsLoading(true);
        setCandlestickData([]); 

        const fetchInitialData = async () => {
            try {
                const response = await fetch(`${REST_API_URL}?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=100`);
                const data = await response.json();
                
                if (Array.isArray(data)) {
                    const initialCandles = data.map(processKline);
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

    // 5. Live Candlestick Update (WebSocket)
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
                            return updatedData;
                        } 
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
    }, [candleMessage, processKline]); 
    
    // 6. Live Ticker Price Update
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
