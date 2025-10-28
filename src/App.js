// src/App.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCryptoSocket } from './hooks/useCryptoSocket'; 
import CandlestickChart from './components/PriceChart'; 
import './App.css'; 

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

// --- Utility Functions for Persistence ---
const getInitialState = (key, defaultValue) => {
    // localStorage से user preferences लोड करें
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
             return JSON.parse(saved);
        } catch (e) {
            console.error("Could not parse localStorage item:", key, e);
            return defaultValue;
        }
    }
    return defaultValue;
};
// ----------------------------------------

function Dashboard() {
    // 1. User Configuration & Persistence
    const [selectedSymbol, setSelectedSymbol] = useState(
        getInitialState('selectedSymbol', COIN_OPTIONS[0].value)
    );
    const [selectedInterval, setSelectedInterval] = useState(
        getInitialState('selectedInterval', TIMEFRAME_OPTIONS[0].value)
    ); 

    // Custom Hook call (SMA और Live Ticker data भी shamil hai)
    const { candlestickData, latestPrice, readyState, isLoading, movingAverages, liveTickerPrice } = useCryptoSocket(selectedSymbol, selectedInterval); 

    // useEffect to save preferences to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('selectedSymbol', JSON.stringify(selectedSymbol));
    }, [selectedSymbol]);

    useEffect(() => {
        localStorage.setItem('selectedInterval', JSON.stringify(selectedInterval));
    }, [selectedInterval]);


    // Connection Status Logic (Error Handling shamil hai)
    const getConnectionStatus = (state) => {
        switch (state) {
            case 1: return { text: 'Open', className: 'status-open' };
            case 0: return { text: 'Connecting...', className: 'status-connecting' };
            case 3: return { text: 'Connection Lost (Attempting Reconnect...)', className: 'status-error' }; 
            default: return { text: 'Closed', className: 'status-closed' };
        }
    };
    const status = getConnectionStatus(readyState); 

    // Live Ticker Color Flash Logic
    const [livePriceColor, setLivePriceColor] = useState('black');
    const prevLivePriceRef = useRef(null); 

    useEffect(() => {
        // Ticker price change hone par color flash karein
        if (liveTickerPrice && prevLivePriceRef.current !== null) {
            if (liveTickerPrice > prevLivePriceRef.current) {
                setLivePriceColor('green');
            } else if (liveTickerPrice < prevLivePriceRef.current) {
                setLivePriceColor('red');
            }
        }
        prevLivePriceRef.current = liveTickerPrice;
        
        // Price color ko turant reset karein (ticker fast hota hai)
        const timer = setTimeout(() => {
            setLivePriceColor('black');
        }, 150); 

        return () => clearTimeout(timer);
    }, [liveTickerPrice]); 


    // Handlers for UI dropdowns
    const handleSymbolChange = useCallback((event) => {
        setSelectedSymbol(event.target.value);
    }, []);
    
    const handleIntervalChange = useCallback((event) => {
        setSelectedInterval(event.target.value);
    }, []);


    return (
        <div className="dashboard-container">
            
            <div className="header-section">
                <h1>📈 Live Crypto Trading Dashboard</h1>
                <div className="info-box">
                    WS Status: <span className={status.className}>{status.text}</span>
                </div>
            </div>

            {/* Selection Bar (Responsive Design ke liye App.css ka upyog) */}
            <div className="selection-bar">
                {/* Symbol Dropdown */}
                <div className="select-group">
                    <label htmlFor="coin-select">Asset:</label>
                    <select 
                        id="coin-select"
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
                <div className="select-group">
                    <label htmlFor="interval-select">Timeframe:</label>
                    <select 
                        id="interval-select"
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

            <hr className="divider"/>
            
            {/* Current Price Display (Live Ticker Price ka upyog) */}
            <div className="price-display-section">
                <h2>{selectedSymbol.toUpperCase()} / {selectedInterval.toUpperCase()}</h2>
                
                {liveTickerPrice !== null ? (
                    <div className="live-price-box">
                        <span className="live-label">LIVE PRICE</span>
                        <h1 style={{ color: livePriceColor }} className="live-price-value">
                            ${liveTickerPrice.toFixed(4)}
                        </h1>
                        {/* Candlestick ka latest close price agar chahiye toh yahan dikhayenge */}
                        <span className="candle-close">Candle Close: ${latestPrice ? latestPrice.toFixed(4) : 'N/A'}</span>
                    </div>
                ) : (
                    <p>Fetching live ticker price...</p>
                )}
            </div>

            <hr className="divider"/>
            
            {/* Chart Section */}
            <div className="chart-section">
                {isLoading ? (
                    <div className="loading-message">
                        <h2>Loading {selectedInterval} data...</h2>
                        <p>Fetching 100 historical candles via REST API...</p>
                    </div>
                ) : (
                    // movingAverages prop ko yahan pass kiya gaya hai
                    <CandlestickChart candlestickData={candlestickData} movingAverages={movingAverages} /> 
                )}
            </div>
            
        </div>
    );
}

export default Dashboard;
