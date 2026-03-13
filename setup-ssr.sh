#!/bin/bash
# Setup script for SSR configuration

echo "🚀 Starting SSR Setup..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js $(node --version) found"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Generate data
echo ""
echo "📊 Generating story data..."
npm run generate

# Build SSR
echo ""
echo "🏗️ Building SSR..."
npm run build:ssr

# Prerender
echo ""
echo "📄 Prerendering static pages..."
npm run prerender

echo ""
echo "✅ SSR setup complete!"
echo ""
echo "📁 Output: docs/ folder"
echo "🚀 To test locally: npm start"
echo "🌐 Visit: http://localhost:4200"
