// src/App.js

import React, { useState, useEffect, useRef } from 'react';
import { useCryptoSocket } from './hooks/useCryptoSocket'; 
import PriceChart from './components/PriceChart'; 
import './App.css'; // Global CSS file import kiya

// ... (COIN_OPTIONS same as before) ...
const COIN_OPTIONS = [
    { label: 'Bitcoin (BTC/USDT)', value: 'btcusdt' },
    { label: 'Ethereum (ETH/USDT)', value: 'ethusdt' },
    { label: 'Solana (SOL/USDT)', value: 'solusdt' },
];

function Dashboard() {
    const [selectedSymbol, setSelectedSymbol] = useState(COIN_OPTIONS[0].value);
    const { latestPrice, chartData, readyState } = useCryptoSocket(selectedSymbol);

    // Dynamic classes for status
    const getConnectionStatus = (state) => {
        switch (state) {
            case 1: return { text: 'Open', className: 'status-open' };
            case 0: return { text: 'Connecting...', className: 'status-connecting' };
            default: return { text: 'Closed', className: 'status-closed' };
        }
    };
    const status = getConnectionStatus(readyState);

    // Price Color Logic (Same as before)
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
        
        const timer = setTimeout(() => {
            setPriceColor('black');
        }, 500); 

        return () => clearTimeout(timer);
    }, [latestPrice]);

    const handleSymbolChange = (event) => {
        setSelectedSymbol(event.target.value);
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
            </div>

            <hr style={{ margin: '20px 0' }}/>
            
            {/* Current Price Display */}
            {latestPrice !== null ? (
                <div className="price-display">
                    <h2>{selectedSymbol.toUpperCase()} Price:</h2>
                    {/* Price color change ko smoothly dikhane ke liye inline style use kiya */}
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
                <PriceChart chartData={chartData} />
            </div>
            
        </div>
    );
}

export default Dashboard;