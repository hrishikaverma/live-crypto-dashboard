// src/utils/mathUtils.js

/**
 * Calculates the Simple Moving Average (SMA) for a given array of numbers.
 * @param {number[]} data - Array of closing prices.
 * @param {number} period - The number of periods to average over (e.g., 20).
 * @returns {number[]} - Array of SMA values.
 */
export const calculateSMA = (data, period) => {
    const sma = [];
    
    // Period ke barabar data hone tak SMA calculate nahi kiya ja sakta
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            // Fill initial null/undefined values
            sma.push(undefined); 
        } else {
            // Slice the relevant period data
            const slice = data.slice(i - period + 1, i + 1);
            // Sum all values in the slice
            const sum = slice.reduce((a, b) => a + b, 0);
            // Calculate average
            sma.push(sum / period);
        }
    }
    return sma;
};
