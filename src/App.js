// src/App.js

import React, { useState, useEffect, useRef } from 'react';
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

function Dashboard() {
    // State for selecting the asset (e.g., btcusdt)
    const [selectedSymbol, setSelectedSymbol] = useState(COIN_OPTIONS[0].value);
    // State for selecting the candlestick interval (e.g., 1m, 5m)
    const [selectedInterval, setSelectedInterval] = useState(TIMEFRAME_OPTIONS[0].value); 
    
    // Custom Hook call (symbol aur interval dono pass ho rahe hain)
    const { candlestickData, latestPrice, readyState, isLoading } = useCryptoSocket(selectedSymbol, selectedInterval); 

    // Connection Status Logic (Error Handling shamil hai)
    const getConnectionStatus = (state) => {
        switch (state) {
            case 1: return { text: 'Open', className: 'status-open' };
            case 0: return { text: 'Connecting...', className: 'status-connecting' };
            // Status 3: Connection lost/closed. react-use-websocket will automatically attempt to reconnect.
            case 3: return { text: 'Connection Lost (Attempting Reconnect...)', className: 'status-error' }; 
            default: return { text: 'Closed', className: 'status-closed' };
        }
    };
    const status = getConnectionStatus(readyState); 

    // Price Color Logic (green for up, red for down)
    const [priceColor, setPriceColor] = useState('black');
    const prevPriceRef = useRef(null); 
    
    useEffect(() => {
        if (latestPrice && prevPriceRef.current !== null) {
            if (latestPrice > prevPriceRef.current) {
                setPriceColor('green');
            } else if (latestPrice < prevPriceRef.current) {
                setPriceColor('red');
            }
        }
        prevPriceRef.current = latestPrice;
        
        // Price color ko thodi der baad reset karein
        const timer = setTimeout(() => {
            setPriceColor('black');
        }, 500); 

        return () => clearTimeout(timer);
    }, [latestPrice]); 

    // Handlers for UI dropdowns
    const handleSymbolChange = (event) => {
        setSelectedSymbol(event.target.value);
    };
    
    const handleIntervalChange = (event) => {
        setSelectedInterval(event.target.value);
    };

    return (
        <div className="dashboard-container">
            
            <div className="header-section">
                <h1>📈 Live Crypto Dashboard</h1>
                <div className="info-box">
                    WebSocket Status: <span className={status.className}>{status.text}</span>
                </div>
            </div>

            <div className="selection-bar">
                {/* Symbol Dropdown */}
                <label htmlFor="coin-select">Track Asset:</label>
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
                
                {/* Interval Dropdown */}
                <label htmlFor="interval-select" style={{ marginLeft: '20px' }}>Timeframe:</label>
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

            <hr style={{ margin: '20px 0' }}/>
            
            {/* Current Price Display */}
            {latestPrice !== null ? (
                <div className="price-display">
                    <h2>{selectedSymbol.toUpperCase()} Price ({selectedInterval.toUpperCase()} Candle):</h2>
                    <h1 style={{ color: priceColor, transition: 'color 0.5s ease' }}>
                        ${latestPrice.toFixed(4)}
                    </h1>
                </div>
            ) : (
                <p>Connecting and loading data for {selectedSymbol.toUpperCase()}...</p>
            )}

            <hr style={{ margin: '20px 0' }}/>
            
            {/* Chart Section */}
            <div className="chart-section">
                {/* Loading state UI: Data fetch hone tak loading message dikhayega */}
                {isLoading ? (
                    <div className="loading-message">
                        <h2>Loading {selectedInterval} data...</h2>
                        <p>Fetching 100 historical candles via REST API...</p>
                    </div>
                ) : (
                    <CandlestickChart candlestickData={candlestickData} /> 
                )}
            </div>
            
        </div>
    );
}

export default Dashboard;
