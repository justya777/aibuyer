const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // App directory is now stable in Next.js 13+, no experimental flag needed
  env: {
    NGROK_URL: process.env.NGROK_URL || 'https://8ef9dec79365.ngrok-free.app'
  }
}

module.exports = nextConfig
