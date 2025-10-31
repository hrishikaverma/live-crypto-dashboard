import React, { useState, useEffect, useRef, useCallback } from 'react';
// Firebase imports assume you have run 'npm install firebase'
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Load Tailwind CSS (Assumed to be available in the environment)

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
            // Calculate sum of the last 'window' closing prices
            const sum = closes.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
            sma.push(sum / window);
        }
    }
    return sma;
};

// --- Custom Hook: useCryptoSocket ---
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

            if (rawData.code === -1121 || rawData.length === 0) {
                console.error("Invalid symbol, interval, or no data available.", rawData);
                setCandlestickData([]);
                setMovingAverages({ sma5: [], sma20: [] });
                setLatestPrice(null);
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
                    let newData = [...prevData];

                    // Check if the incoming candle data is for the current, unclosed candle
                    if (newData.length > 0 && newCandle.openTime === newData[newData.length - 1].openTime) {
                         // Update the existing last candle (real-time tick update)
                        newData[newData.length - 1] = newCandle;
                    } 
                    // Check if it's a new candle (openTime is greater than last one)
                    else if (newData.length === 0 || newCandle.openTime > newData[newData.length - 1].openTime) {
                        // Add new candle
                        newData.push(newCandle);
                        if (newData.length > 100) newData = newData.slice(-100); // Keep only last 100
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
            // Reconnect only if the symbol/interval hasn't changed since this effect ran
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

const CHART_HEIGHT_PX = 384; // h-96 in Tailwind

const PriceChart = ({ candlestickData, movingAverages }) => {
    // Only show the last 20 candles for simple visualization
    const displayData = candlestickData.slice(-20);
    
    // Get the latest SMA values for the header display
    const latestSMA5 = movingAverages.sma5[movingAverages.sma5.length - 1];
    const latestSMA20 = movingAverages.sma20[movingAverages.sma20.length - 1];
    
    // Determine y-axis min/max for scaling
    const allPrices = displayData.flatMap(d => [d.high, d.low]).filter(p => !isNaN(p));
    // Include SMA values to ensure they stay on the chart
    const allSMAValues = movingAverages.sma5.slice(-20).concat(movingAverages.sma20.slice(-20)).filter(p => p !== null && !isNaN(p));
    const combinedPrices = [...allPrices, ...allSMAValues];

    const maxPrice = combinedPrices.length > 0 ? Math.max(...combinedPrices) : 1;
    const minPrice = combinedPrices.length > 0 ? Math.min(...combinedPrices) : 0;
    
    // Add a small buffer to the min/max for better visual padding
    const buffer = (maxPrice - minPrice) * 0.05 || 0.1;
    const chartMax = maxPrice + buffer;
    const chartMin = Math.max(0, minPrice - buffer); // Price can't be negative
    const range = chartMax - chartMin;
    
    // Calculate the pixel-to-price ratio for accurate positioning
    const pixelPerUnit = range > 0 ? CHART_HEIGHT_PX / range : 0; 
    
    const formatPrice = (price) => price.toFixed(2);

    // Utility function to convert a price value to a pixel height from the bottom of the chart
    const priceToPixel = (price) => (price - chartMin) * pixelPerUnit;

    const SMA_COLORS = {
        5: 'bg-indigo-500',
        20: 'bg-red-500',
    };

    if (displayData.length === 0) {
        return (
            <div className="text-center p-8 bg-gray-700 text-gray-400 rounded-xl">
                Fetching chart data... If this persists, check the connection status.
            </div>
        );
    }
    
    // Simplified price labels for Y-Axis
    const yAxisLabels = [
        chartMax,
        chartMin + range * 0.75,
        chartMin + range * 0.5,
        chartMin + range * 0.25,
        chartMin
    ];

    return (
        <div className="bg-gray-800 p-4 rounded-xl shadow-2xl transition-all w-full overflow-x-auto">
            <div className="flex justify-between items-center text-gray-300 mb-4">
                <h3 className="text-lg font-semibold">Price Action (Last {displayData.length} Candles)</h3>
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

            <div className="flex relative border-l border-b border-gray-600" style={{ height: `${CHART_HEIGHT_PX}px` }}>
                
                {/* Y-Axis Price Labels & Grid Lines (Background) */}
                <div className="absolute right-0 top-0 h-full w-full pointer-events-none">
                    {yAxisLabels.map((price, index) => {
                        const isMaxMin = index === 0 || index === yAxisLabels.length - 1;
                        // Calculate position from bottom, relative to the chart height
                        const bottomPosition = priceToPixel(price);

                        return (
                            <React.Fragment key={price}>
                                {/* Horizontal Grid Line */}
                                {!isMaxMin && (
                                    <div 
                                        className="absolute left-0 w-full border-t border-dashed border-gray-700"
                                        style={{ bottom: `${bottomPosition}px` }}
                                    ></div>
                                )}
                                {/* Label Text (aligned to the right border) */}
                                <span 
                                    className={`absolute right-[-4.5rem] text-xs px-1 rounded-sm ${isMaxMin ? 'font-bold text-indigo-400' : 'text-gray-400'}`}
                                    style={{ bottom: `${bottomPosition - 8}px` }}
                                >
                                    {formatPrice(price)}
                                </span>
                            </React.Fragment>
                        );
                    })}
                </div>


                {/* Candlestick Visualization */}
                {displayData.map((d, index) => {
                    const isUp = d.close > d.open;
                    
                    // Calculate pixel positions for Open, Close, High, Low
                    const highPos = priceToPixel(d.high);
                    const lowPos = priceToPixel(d.low);
                    const openPos = priceToPixel(d.open);
                    const closePos = priceToPixel(d.close);
                    
                    // Body start is the lower of open/close, body height is the difference
                    const bodyStartOffset = Math.min(openPos, closePos);
                    const bodyHeightPx = Math.abs(openPos - closePos); 
                    const wickHeightPx = highPos - lowPos; 

                    const color = isUp ? 'bg-green-500' : 'bg-red-500';
                    const wickColor = isUp ? 'bg-green-600' : 'bg-red-600';

                    return (
                        <div key={d.openTime} className="flex flex-col flex-1 relative justify-end z-10">
                            
                            {/* Wick (Full High-Low Range) */}
                            <div 
                                className={`absolute left-1/2 -translate-x-1/2 w-[2px] ${wickColor} transition-all duration-100`}
                                style={{
                                    bottom: `${lowPos}px`, // Wick starts at Low position
                                    height: `${wickHeightPx}px`
                                }}
                            ></div>
                            
                            {/* Body (Open-Close Range) */}
                            <div 
                                className={`absolute left-1/2 -translate-x-1/2 w-3 ${color} rounded-sm transition-all duration-100`}
                                style={{
                                    bottom: `${bodyStartOffset}px`,
                                    height: `${bodyHeightPx > 1 ? bodyHeightPx : 1}px` // Minimum height of 1px for flat candles
                                }}
                            ></div>

                            {/* Tooltip placeholder for the candle */}
                             <div className="absolute inset-0 group cursor-pointer z-20">
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 p-2 bg-gray-900 text-gray-200 text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                    <p>Time: {new Date(d.openTime).toLocaleTimeString()}</p>
                                    <p>Open: {formatPrice(d.open)}</p>
                                    <p>Close: {formatPrice(d.close)}</p>
                                    <p>H/L: {formatPrice(d.high)}/{formatPrice(d.low)}</p>
                                    <p>Vol: {d.volume.toFixed(0)}</p>
                                </div>
                            </div>

                        </div>
                    );
                })}

                {/* Moving Average Overlay (Line visualization - connecting dots) */}
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-30" style={{ height: `${CHART_HEIGHT_PX}px` }}>
                    {
                        [5, 20].map(window => {
                            const smaValues = movingAverages[`sma${window}`];
                            const color = window === 5 ? 'indigo' : 'red';
                            
                            const startIndex = candlestickData.length - displayData.length;
                            const points = displayData
                                .map((d, index) => {
                                    const smaValue = smaValues[startIndex + index];
                                    if (smaValue === null) return null;

                                    // Calculate X and Y coordinates for SVG
                                    const x = (index + 0.5) * (100 / displayData.length); // 0.5 centers it on the candle
                                    const y = CHART_HEIGHT_PX - priceToPixel(smaValue);

                                    return `${x}% ${y}`;
                                })
                                .filter(p => p !== null)
                                .join(' ');

                            if (points.length < 2) return null;

                            return (
                                <polyline 
                                    key={`sma-line-${window}`}
                                    fill="none"
                                    stroke={`var(--tw-color-${color}-400)`}
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    points={points}
                                />
                            );
                        })
                    }
                </svg>

            </div>
        </div>
    );
};


// --- Main Dashboard Component ---

const COIN_OPTIONS = [
    { label: 'Bitcoin (BTC/USDT)', value: 'btcusdt' },
    { label: 'Ethereum (ETH/USDT)', value: 'ethusdt' },
    { label: 'Solana (SOL/USDT)', value: 'solusdt' },
    { label: 'XRP (XRP/USDT)', value: 'xrpusdt' }, // Added XRP
];

const TIMEFRAME_OPTIONS = [
    { label: '1 Minute', value: '1m' },
    { label: '5 Minutes', value: '5m' },
    { label: '15 Minutes', value: '15m' },
    { label: '1 Hour', value: '1h' },
    { label: '4 Hour', value: '4h' }, // Added 4 Hour
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

    // Custom Hook call
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
        // Save new symbol but keep existing interval
        savePreferences(newSymbol, selectedInterval);
    }, [selectedInterval, savePreferences]);
    
    const handleIntervalChange = useCallback((event) => {
        const newInterval = event.target.value;
        setSelectedInterval(newInterval);
        // Save new interval but keep existing symbol
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

    // Loading State Check (Wait for both Auth and initial data fetch)
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
                .flash-up { animation: flash-up-animation 0.3s ease-in-out; }
                .flash-down { animation: flash-down-animation 0.3s ease-in-out; }

                @keyframes flash-up-animation {
                    0% { color: var(--tw-color-white); transform: scale(1); }
                    50% { color: var(--tw-color-green-400); transform: scale(1.05); }
                    100% { color: var(--tw-color-white); transform: scale(1); }
                }
                @keyframes flash-down-animation {
                    0% { color: var(--tw-color-white); transform: scale(1); }
                    50% { color: var(--tw-color-red-400); transform: scale(1.05); }
                    100% { color: var(--tw-color-white); transform: scale(1); }
                }

                .app-select { 
                    appearance: none; 
                    /* Custom SVG Arrow for the select box */
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='white'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd' /%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 0.5rem center;
                    background-size: 1.5em 1.5em;
                    padding-right: 2.5rem; /* Add space for the custom arrow */
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
                            <h1 className={`text-3xl sm:text-4xl font-extrabold transition-all duration-300 ${livePriceColor}`}>
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
