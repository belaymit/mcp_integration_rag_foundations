#!/bin/bash

# MCP Environment Startup Script

echo "🚀 Starting MCP Integration Environment..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating template..."
    echo "GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here" > .env
    echo "📝 Please edit .env file and add your GitHub Personal Access Token"
    echo "   Then run this script again."
    exit 1
fi

# Check if GitHub token is set
if grep -q "your_token_here" .env; then
    echo "⚠️  Please update .env file with your actual GitHub Personal Access Token"
    echo "   Edit .env and replace 'your_token_here' with your token"
    exit 1
fi

# Build required images if they don't exist
echo "🔨 Building required Docker images..."
if ! docker images | grep -q filesystem-mcp; then
    echo "Building filesystem-mcp image..."
    if [ -d "./mcp_server" ]; then
        docker build -t filesystem-mcp ./mcp_server/
    else
        echo "⚠️  mcp_server directory not found. Skipping filesystem-mcp build."
    fi
fi

# Start the environment
echo "🐳 Starting Docker Compose services..."
docker compose up -d

# Wait a moment for services to start
sleep 5

# Check service status
echo "📊 Service Status:"
docker compose ps

echo ""
echo "✅ MCP Environment Started!"
echo ""
echo "🌐 Available Services:"
echo "   • GitHub MCP Server:     http://localhost:8001"
echo "   • Filesystem MCP Server: http://localhost:8002"
echo "   • Google Drive MCP:      http://localhost:8005"
echo ""
echo "🧪 Test the services:"
echo "   curl http://localhost:8001/health"
echo "   curl http://localhost:8002/health"
echo "   curl http://localhost:8005/health"
echo ""
echo "🛑 To stop the environment:"
echo "   docker compose down" 