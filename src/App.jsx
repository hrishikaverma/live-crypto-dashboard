import React, { useState, useEffect, useRef, useCallback } from 'react';
// Firebase imports assume you have run 'npm install firebase'
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- Global Configuration & Setup ---
// NOTE FOR LOCAL DEVELOPMENT:
// The variables below (prefixed with __) are automatically provided when running
// within the Canvas environment. If you are running this code locally, the
// placeholders (mock values) will be used instead.
const mockFirebaseConfig = {
    apiKey: "YOUR_API_KEY", // <<< REPLACE with your actual API Key
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
};
const mockAppId = 'local-dev-crypto-dashboard'; // Unique ID for Firestore path isolation
const mockAuthToken = null; // Replace with a Firebase Custom Token string if needed for non-anonymous testing

// Resolve config: Use Canvas globals if they exist, otherwise use mocks
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : mockFirebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : mockAppId;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : mockAuthToken;


// Initialize Firebase (will be done in useEffect)
let app, db, auth;

// --- Utility: Simple Moving Average (SMA) Calculation ---
const calculateSMA = (data, window) => {
    const closes = data.map(d => parseFloat(d.close));
    const sma = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < window - 1) {
            sma.push(null);
        } else {
            const sum = closes.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
            sma.push(sum / window);
        }
    }
    return sma;
};

// --- Custom Hook: useCryptoSocket (Original Logic Integrated) ---
const useCryptoSocket = (symbol, interval) => {
    const [candlestickData, setCandlestickData] = useState([]);
    const [latestPrice, setLatestPrice] = useState(null);
    const [liveTickerPrice, setLiveTickerPrice] = useState(null);
    const [readyState, setReadyState] = useState(0); // 0: Connecting, 1: Open, 3: Closed/Error
    const [isLoading, setIsLoading] = useState(true);
    const [movingAverages, setMovingAverages] = useState({ sma5: [], sma20: [] });

    // WebSocket Refs
    const wsRef = useRef(null);
    const tickerRef = useRef(null);
    const currentIntervalRef = useRef(interval);
    const currentSymbolRef = useRef(symbol);

    // Fetch initial historical data via REST API
    const fetchHistoricalData = useCallback(async (sym, int) => {
        setIsLoading(true);
        try {
            const url = `https://api.binance.com/api/v3/klines?symbol=${sym.toUpperCase()}&interval=${int}&limit=100`;
            const response = await fetch(url);
            const rawData = await response.json();

            if (rawData.code === -1121) {
                console.error("Invalid symbol or interval:", rawData.msg);
                setCandlestickData([]);
                setIsLoading(false);
                return;
            }

            const formattedData = rawData.map(d => ({
                openTime: d[0],
                open: parseFloat(d[1]),
                high: parseFloat(d[2]),
                low: parseFloat(d[3]),
                close: parseFloat(d[4]),
                volume: parseFloat(d[5]),
                closeTime: d[6],
            }));
            setCandlestickData(formattedData);
            setLatestPrice(formattedData.length > 0 ? formattedData[formattedData.length - 1].close : null);

            // Calculate MAs
            const sma5 = calculateSMA(formattedData, 5);
            const sma20 = calculateSMA(formattedData, 20);
            setMovingAverages({ sma5, sma20 });

        } catch (error) {
            console.error("Error fetching historical data:", error);
            setCandlestickData([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Effect for WebSocket Connection (Kline Data)
    useEffect(() => {
        if (!symbol || !interval) return;

        // Close previous connection before starting new one
        if (wsRef.current) {
            wsRef.current.close();
        }

        currentSymbolRef.current = symbol;
        currentIntervalRef.current = interval;
        fetchHistoricalData(symbol, interval);
        
        const klineStream = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
        const ws = new WebSocket(klineStream);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`Kline WS connected for ${symbol}/${interval}`);
            setReadyState(1);
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.k) {
                const kline = message.k;
                const newCandle = {
                    openTime: kline.t,
                    open: parseFloat(kline.o),
                    high: parseFloat(kline.h),
                    low: parseFloat(kline.l),
                    close: parseFloat(kline.c),
                    volume: parseFloat(kline.v),
                    closeTime: kline.T,
                    isFinal: kline.x, // Is this candle closed?
                };

                setCandlestickData(prevData => {
                    const newData = [...prevData];
                    // If the latest candle is not closed, replace it (update in progress)
                    if (!newData.length || !kline.x) { // Use kline.x (isFinal) for real-time check
                        if (newData.length > 0) {
                            newData[newData.length - 1] = newCandle;
                        } else {
                            newData.push(newCandle);
                        }
                    } 
                    // If the latest candle is closed (final), and the new update is for a NEW candle (different openTime)
                    else if (newCandle.openTime > newData[newData.length - 1].openTime) {
                        newData.push(newCandle);
                        if (newData.length > 100) newData.shift(); // Keep only last 100
                    }
                    
                    // Recalculate MAs and update latest price on every message
                    const sma5 = calculateSMA(newData, 5);
                    const sma20 = calculateSMA(newData, 20);
                    setMovingAverages({ sma5, sma20 });
                    setLatestPrice(newCandle.close);

                    return newData;
                });
            }
        };

        ws.onclose = () => {
            console.log('Kline WS closed. Attempting reconnect...');
            setReadyState(3); // Connection Lost
            // Simple reconnect logic (In a real app, use exponential backoff)
            setTimeout(() => {
                if (currentSymbolRef.current === symbol && currentIntervalRef.current === interval) {
                    // Re-run the effect to re-establish connection
                    fetchHistoricalData(symbol, interval);
                }
            }, 5000); 
        };

        ws.onerror = (err) => {
            console.error('Kline WS error:', err);
            setReadyState(3);
            ws.close();
        };

        return () => {
            ws.close();
            setReadyState(3);
        };
    }, [symbol, interval, fetchHistoricalData]);
    
    // Effect for Ticker WebSocket (Live Price)
    useEffect(() => {
        if (!symbol) return;
        
        if (tickerRef.current) {
            tickerRef.current.close();
        }

        const tickerStream = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`;
        const wsTicker = new WebSocket(tickerStream);
        tickerRef.current = wsTicker;

        wsTicker.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.c) { // c is last price
                setLiveTickerPrice(parseFloat(message.c));
            }
        };

        wsTicker.onerror = (err) => console.error('Ticker WS error:', err);

        return () => {
            wsTicker.close();
        };
    }, [symbol]);

    return { candlestickData, latestPrice, readyState, isLoading, movingAverages, liveTickerPrice };
};

// --- Candlestick Chart Visualization Component ---

const PriceChart = ({ candlestickData, movingAverages }) => {
    // Only show the last 20 candles for simple visualization
    const displayData = candlestickData.slice(-20);
    const latestSMA5 = movingAverages.sma5[movingAverages.sma5.length - 1];
    const latestSMA20 = movingAverages.sma20[movingAverages.sma20.length - 1];
    
    // Determine y-axis min/max for scaling
    const allPrices = displayData.flatMap(d => [d.high, d.low]).filter(p => !isNaN(p));
    const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 1;
    const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const range = maxPrice - minPrice;
    
    // Prevent division by zero
    const scaleFactor = range > 0 ? 100 / range : 0; 
    
    const SMA_COLORS = {
        5: 'bg-indigo-500',
        20: 'bg-red-500',
        '5_line': 'absolute top-0 w-full h-[2px] bg-indigo-500', // Fixed syntax here
        '20_line': 'absolute top-0 w-full h-[2px] bg-red-500', // Fixed syntax here
    };

    if (displayData.length === 0) {
        return (
            <div className="text-center p-8 bg-gray-700 text-gray-400 rounded-lg">
                No chart data available yet. Please check connection.
            </div>
        );
    }
    
    const formatPrice = (price) => price.toFixed(2);

    return (
        <div className="bg-gray-800 p-4 rounded-xl shadow-2xl transition-all w-full max-w-full overflow-x-auto">
            <div className="flex justify-between items-center text-gray-300 mb-4">
                <h3 className="text-lg font-semibold">Price Action (Last 20 Candles)</h3>
                <div className="flex space-x-4 text-sm">
                    <span className="flex items-center">
                        <span className={`w-3 h-3 rounded-full mr-2 ${SMA_COLORS[5]}`}></span>
                        SMA 5: {latestSMA5 ? formatPrice(latestSMA5) : 'N/A'}
                    </span>
                    <span className="flex items-center">
                        <span className={`w-3 h-3 rounded-full mr-2 ${SMA_COLORS[20]}`}></span>
                        SMA 20: {latestSMA20 ? formatPrice(latestSMA20) : 'N/A'}
                    </span>
                </div>
            </div>

            <div className="flex h-96 relative border-l border-b border-gray-600">
                {/* Candlestick Visualization */}
                {displayData.map((d, index) => {
                    const isUp = d.close > d.open;
                    const wickHeight = Math.abs(d.high - d.low) * scaleFactor;
                    const bodyHeight = Math.abs(d.open - d.close) * scaleFactor;
                    
                    // Calculate positions relative to minPrice
                    const lowPos = (d.low - minPrice) * scaleFactor;
                    const openPos = (d.open - minPrice) * scaleFactor;
                    const closePos = (d.close - minPrice) * scaleFactor;
                    
                    // Body start is the lower of open/close
                    const bodyStartOffset = (Math.min(openPos, closePos)) * 3.6; 
                    const wickHeightPx = wickHeight * 3.6; 
                    const bodyHeightPx = bodyHeight * 3.6; 

                    // Color based on direction
                    const color = isUp ? 'bg-green-500' : 'bg-red-500';

                    return (
                        <div key={d.openTime} className="flex flex-col flex-1 relative justify-end">
                            {/* Wick (Full High-Low Range) */}
                            <div 
                                className={`absolute left-1/2 -translate-x-1/2 w-[2px] ${isUp ? 'bg-green-600' : 'bg-red-600'} transition-all duration-100`}
                                style={{
                                    bottom: `${lowPos * 3.6}px`, // Wick starts at Low
                                    height: `${wickHeightPx}px`
                                }}
                            ></div>
                            
                            {/* Body (Open-Close Range) */}
                            <div 
                                className={`absolute left-1/2 -translate-x-1/2 w-3 ${color} rounded-sm transition-all duration-100`}
                                style={{
                                    bottom: `${bodyStartOffset}px`,
                                    height: `${bodyHeightPx}px`
                                }}
                            ></div>
                        </div>
                    );
                })}

                {/* Y-Axis Price Labels (Right side) */}
                <div className="absolute right-0 top-0 h-full w-16 flex flex-col justify-between text-xs text-gray-400">
                    <span className="absolute top-[-0.5rem] right-0 font-bold">{formatPrice(maxPrice)}</span>
                    <span className="absolute bottom-[-0.5rem] right-0 font-bold">{formatPrice(minPrice)}</span>
                </div>

                {/* Moving Average Overlay (Simple dots visualization) */}
                {displayData.map((d, index) => {
                    const sma5Value = movingAverages.sma5[candlestickData.length - displayData.length + index];
                    const sma20Value = movingAverages.sma20[candlestickData.length - displayData.length + index];

                    const sma5Pos = sma5Value !== null ? (sma5Value - minPrice) * scaleFactor * 3.6 : null;
                    const sma20Pos = sma20Value !== null ? (sma20Value - minPrice) * scaleFactor * 3.6 : null;

                    return (
                        <div key={`sma-${d.openTime}`} className="flex-1 relative">
                            {sma5Pos !== null && (
                                <div 
                                    className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${SMA_COLORS[5]} transition-all duration-100`}
                                    style={{ bottom: `${sma5Pos}px` }}
                                    title={`SMA 5: ${formatPrice(sma5Value)}`}
                                ></div>
                            )}
                            {sma20Pos !== null && (
                                <div 
                                    className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${SMA_COLORS[20]} transition-all duration-100`}
                                    style={{ bottom: `${sma20Pos}px` }}
                                    title={`SMA 20: ${formatPrice(sma20Value)}`}
                                ></div>
                            )}
                        </div>
                    );
                })}

            </div>
        </div>
    );
};


// --- Main Dashboard Component ---

const COIN_OPTIONS = [
    { label: 'Bitcoin (BTC/USDT)', value: 'btcusdt' },
    { label: 'Ethereum (ETH/USDT)', value: 'ethusdt' },
    { label: 'Solana (SOL/USDT)', value: 'solusdt' },
];

const TIMEFRAME_OPTIONS = [
    { label: '1 Minute', value: '1m' },
    { label: '5 Minutes', value: '5m' },
    { label: '15 Minutes', value: '15m' },
    { label: '1 Hour', value: '1h' },
];

const PREFS_DOC_PATH = (userId) => `artifacts/${appId}/users/${userId}/preferences/trading_dashboard`;

export default function App() {
    const [selectedSymbol, setSelectedSymbol] = useState(COIN_OPTIONS[0].value);
    const [selectedInterval, setSelectedInterval] = useState(TIMEFRAME_OPTIONS[0].value);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    // --- 1. Firebase Initialization and Authentication ---
    useEffect(() => {
        try {
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            
            // Sign in with custom token or anonymously
            const authenticate = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Firebase Auth Error:", error);
                }
            };
            authenticate();

            // Auth State Listener
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    // Fallback for unauthenticated/anonymous users
                    setUserId(crypto.randomUUID()); 
                    setIsAuthReady(true);
                }
            });

            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase Initialization Failed:", e);
        }
    }, []);

    // --- 2. Load User Preferences from Firestore ---
    useEffect(() => {
        // We only attempt Firestore operations if auth is ready, db is initialized, and we have a userId
        if (!isAuthReady || !userId || !db) return;

        const prefsDocRef = doc(db, PREFS_DOC_PATH(userId));
        
        const unsubscribe = onSnapshot(prefsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Load from Firestore, otherwise use local state/default
                setSelectedSymbol(data.symbol || COIN_OPTIONS[0].value);
                setSelectedInterval(data.interval || TIMEFRAME_OPTIONS[0].value);
            }
        }, (error) => {
            console.error("Error reading preferences from Firestore:", error);
        });

        return () => unsubscribe();
    }, [isAuthReady, userId]); // Dependency on auth readiness and userId

    // --- 3. Save User Preferences to Firestore ---
    const savePreferences = useCallback(async (symbol, interval) => {
        if (!isAuthReady || !userId || !db) return;
        
        try {
            await setDoc(doc(db, PREFS_DOC_PATH(userId)), {
                symbol,
                interval,
                updatedAt: new Date().getTime(),
            }, { merge: true });
        } catch (e) {
            console.error("Error saving preferences to Firestore:", e);
        }
    }, [isAuthReady, userId]);

    // Custom Hook call (Removed db/userId dependencies as they are not needed in the hook)
    const { 
        candlestickData, 
        latestPrice, 
        readyState, 
        isLoading, 
        movingAverages, 
        liveTickerPrice 
    } = useCryptoSocket(selectedSymbol, selectedInterval); 

    // Handlers for UI dropdowns that also save to Firestore
    const handleSymbolChange = useCallback((event) => {
        const newSymbol = event.target.value;
        setSelectedSymbol(newSymbol);
        savePreferences(newSymbol, selectedInterval);
    }, [selectedInterval, savePreferences]);
    
    const handleIntervalChange = useCallback((event) => {
        const newInterval = event.target.value;
        setSelectedInterval(newInterval);
        savePreferences(selectedSymbol, newInterval);
    }, [selectedSymbol, savePreferences]);

    // Connection Status Logic 
    const getConnectionStatus = (state) => {
        switch (state) {
            case 1: return { text: 'Open', className: 'bg-green-500' };
            case 0: return { text: 'Connecting...', className: 'bg-yellow-500' };
            case 3: return { text: 'Connection Lost', className: 'bg-red-500' }; 
            default: return { text: 'Closed', className: 'bg-gray-500' };
        }
    };
    const status = getConnectionStatus(readyState); 

    // Live Ticker Color Flash Logic
    const [livePriceColor, setLivePriceColor] = useState('text-white');
    const prevLivePriceRef = useRef(null); 

    useEffect(() => {
        if (liveTickerPrice && prevLivePriceRef.current !== null) {
            if (liveTickerPrice > prevLivePriceRef.current) {
                setLivePriceColor('text-green-400 flash-up');
            } else if (liveTickerPrice < prevLivePriceRef.current) {
                setLivePriceColor('text-red-400 flash-down');
            }
        }
        prevLivePriceRef.current = liveTickerPrice;
        
        // Reset color quickly
        const timer = setTimeout(() => {
            setLivePriceColor('text-white');
        }, 300); 

        return () => clearTimeout(timer);
    }, [liveTickerPrice]); 

    // Loading State Check
    if (!isAuthReady || isLoading) {
        return (
            <div className="flex justify-center items-center h-screen bg-gray-900 text-white">
                <div className="text-center p-8 bg-gray-800 rounded-xl shadow-2xl">
                    <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-lg">Initializing Dashboard and fetching initial data...</p>
                </div>
            </div>
        );
    }


    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8 font-inter">
            <style jsx="true">{`
                .flash-up { transition: color 0.15s ease-in; }
                .flash-down { transition: color 0.15s ease-in; }
                .app-select { 
                    appearance: none; 
                    /* Custom SVG Arrow for the select box */
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='white'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd' /%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 0.5rem center;
                    background-size: 1.5em 1.5em;
                }
            `}</style>
            
            <header className="flex flex-col md:flex-row justify-between items-center mb-6 border-b border-indigo-700 pb-4">
                <h1 className="text-3xl font-bold text-indigo-400 mb-3 md:mb-0">
                    📈 Live Crypto Trading Dashboard
                </h1>
                <div className="flex items-center space-x-3 text-sm">
                    <span className="text-gray-400">WS Status:</span>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full text-white ${status.className}`}>
                        {status.text}
                    </span>
                </div>
            </header>

            {/* Selection & Live Price Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                
                {/* 1. Selection Bar */}
                <div className="col-span-1 md:col-span-2 flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 bg-gray-800 p-4 rounded-xl shadow-lg">
                    
                    {/* Symbol Dropdown */}
                    <div className="select-group flex-1 min-w-[200px]">
                        <label htmlFor="coin-select" className="block text-sm font-medium text-gray-400 mb-1">Asset:</label>
                        <select 
                            id="coin-select"
                            className="app-select w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                            value={selectedSymbol}
                            onChange={handleSymbolChange}
                        >
                            {COIN_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Interval Dropdown */}
                    <div className="select-group flex-1 min-w-[150px]">
                        <label htmlFor="interval-select" className="block text-sm font-medium text-gray-400 mb-1">Timeframe:</label>
                        <select 
                            id="interval-select"
                            className="app-select w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                            value={selectedInterval}
                            onChange={handleIntervalChange}
                        >
                            {TIMEFRAME_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 2. Current Price Display */}
                <div className="col-span-1 bg-gray-800 p-4 rounded-xl shadow-lg border-l-4 border-indigo-500 flex flex-col justify-center">
                    <h2 className="text-lg font-semibold text-gray-300 mb-1">
                        {selectedSymbol.toUpperCase()} / {selectedInterval.toUpperCase()}
                    </h2>
                    
                    {liveTickerPrice !== null ? (
                        <div className="live-price-box">
                            <span className="live-label text-xs font-medium text-indigo-400 uppercase">
                                Live Price (Ticker)
                            </span>
                            <h1 className={`text-3xl sm:text-4xl font-extrabold ${livePriceColor}`}>
                                ${liveTickerPrice.toFixed(4)}
                            </h1>
                            <span className="candle-close text-xs text-gray-500">
                                Candle Close: ${latestPrice ? latestPrice.toFixed(4) : 'N/A'}
                            </span>
                        </div>
                    ) : (
                        <p className="text-gray-500">Waiting for live ticker data...</p>
                    )}
                </div>
            </div>
            
            {/* Chart Section */}
            <div className="chart-section w-full">
                <PriceChart 
                    candlestickData={candlestickData} 
                    movingAverages={movingAverages} 
                /> 
            </div>
            
            <footer className="mt-8 pt-4 border-t border-gray-700 text-xs text-gray-500 text-center">
                Data provided by Binance via WebSocket/REST API. Charting is a simplified visualization.
                <div className='mt-1'>User ID: {userId || "Loading..."} (Preferences saved to Firestore)</div>
            </footer>
        </div>
    );
}
