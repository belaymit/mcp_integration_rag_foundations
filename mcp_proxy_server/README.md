# MCP Proxy Server

A robust proxy/gateway server that routes MCP (Model Context Protocol) requests to appropriate downstream MCP servers based on configurable routing strategies.

## Features

- **Multiple Routing Strategies**: Prefix-based and header-based routing
- **Health Monitoring**: Automatic health checks for downstream servers
- **Methods Aggregation**: Combines tools from all downstream servers
- **Error Handling**: Comprehensive error handling and forwarding
- **Request Logging**: Detailed request/response logging
- **CORS Support**: Configurable CORS for web applications
- **Docker Support**: Ready for containerized deployment

## Architecture

```
Client Request → MCP Proxy Server → Downstream MCP Server
                      ↓
                 Route Decision
                 (prefix/header)
                      ↓
                 Forward Request
                      ↓
                 Return Response
```

## Quick Start

### 1. Start with Docker Compose

```bash
# Start all services including proxy
docker compose up -d

# Proxy server will be available at http://localhost:8000
```

### 2. Manual Setup

```bash
# Install dependencies
npm install

# Start the proxy server
npm run start:proxy

# Or directly
node mcp_proxy_server/proxy_server.js
```

## Configuration

The proxy server is configured via `config.js`. Key configuration options:

### Environment Variables

```bash
# Server configuration
PROXY_PORT=8000
PROXY_HOST=localhost
REQUEST_TIMEOUT=30000

# Downstream server URLs
GITHUB_MCP_URL=http://localhost:8001
FILESYSTEM_MCP_URL=http://localhost:8002
GDRIVE_MCP_URL=http://localhost:8005

# Routing strategy
ROUTING_STRATEGY=prefix  # or 'header'
DEFAULT_MCP_SERVER=github

# Logging
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true

# Health checks
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_INTERVAL=60000

# CORS
CORS_ENABLED=true
CORS_ORIGIN=*
```

### Downstream Server Configuration

```javascript
downstreamServers: {
  'github': {
    url: 'http://localhost:8001',
    description: 'GitHub MCP Server',
    healthEndpoint: '/health',
    timeout: 15000,
  },
  'filesystem': {
    url: 'http://localhost:8002',
    description: 'Filesystem MCP Server',
    healthEndpoint: '/health',
    timeout: 10000,
  },
  'gdrive': {
    url: 'http://localhost:8005',
    description: 'Google Drive MCP Server',
    healthEndpoint: '/health',
    timeout: 20000,
  },
}
```

## API Reference

### Health Check

```http
GET /health
```

Returns proxy server health status and downstream server health.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 123456,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "server_info": {...},
  "downstream_health": {...},
  "request_count": 42
}
```

### Server Information

```http
GET /info
```

Returns proxy server configuration and capabilities.

**Response:**
```json
{
  "name": "MCP Proxy Server",
  "version": "1.0.0",
  "routing_strategy": "prefix",
  "downstream_servers": ["github", "filesystem", "gdrive"],
  "endpoints": {...}
}
```

### Methods Aggregation

```http
GET /mcp/get_methods
```

Aggregates and returns all available tools from downstream servers.

**Response:**
```json
{
  "proxy_info": {...},
  "downstream_servers": {
    "github": {
      "status": "available",
      "tools": [...]
    }
  },
  "aggregated_tools": [
    {
      "name": "github.search_repositories",
      "server": "github",
      "description": "Search GitHub repositories"
    }
  ]
}
```

## Routing Strategies

### 1. Prefix-based Routing (Default)

Route requests based on URL prefix:

```http
# Route to GitHub server
GET /proxy/github/tools

# Route to Filesystem server
POST /proxy/filesystem/files
```

**URL Pattern:** `/proxy/{target}/{endpoint}`

### 2. Header-based Routing

Route requests based on HTTP header:

```http
GET /mcp/tools
X-Target-MCP: github
```

**Header:** `X-Target-MCP: {target}`

## Usage Examples

### Basic Health Check

```bash
# Check proxy health
curl http://localhost:8000/health

# Check specific downstream server via proxy
curl http://localhost:8000/proxy/github/health
```

### Prefix-based Requests

```bash
# Get GitHub tools
curl http://localhost:8000/proxy/github/tools

# Search repositories
curl -X POST http://localhost:8000/proxy/github/search \
  -H "Content-Type: application/json" \
  -d '{"query": "nodejs"}'

# Read filesystem file
curl http://localhost:8000/proxy/filesystem/files/readme.txt
```

### Header-based Requests

```bash
# Get tools using header routing
curl http://localhost:8000/mcp/tools \
  -H "X-Target-MCP: github"

# Invoke method using header routing
curl -X POST http://localhost:8000/mcp/invoke \
  -H "X-Target-MCP: filesystem" \
  -H "Content-Type: application/json" \
  -d '{"method": "read_file", "params": {"path": "/test.txt"}}'
```

### Methods Aggregation

```bash
# Get all available methods from all servers
curl http://localhost:8000/mcp/get_methods
```

## Error Handling

The proxy server handles various error scenarios:

### Unknown Target Server

```http
GET /proxy/unknown/tools
```

**Response (400):**
```json
{
  "error": "Unable to determine target server",
  "message": "Unknown target server: unknown",
  "available_targets": ["github", "filesystem", "gdrive"]
}
```

### Downstream Server Unavailable

```http
GET /proxy/github/tools
```

**Response (503):**
```json
{
  "error": "Downstream server unavailable",
  "message": "Unable to connect to the target MCP server"
}
```

### Missing Routing Information

```http
GET /mcp/tools
# (without X-Target-MCP header)
```

**Response (400):**
```json
{
  "error": "Unable to determine target server",
  "message": "Missing X-Target-MCP header"
}
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run proxy-specific tests
npm run test:proxy

# Run tests with coverage
npm run test:coverage
```

### Integration Testing

```bash
# Start downstream servers first
docker compose up -d github-mcp filesystem-mcp gdrive-mcp

# Start proxy server
npm run start:proxy

# Run integration tests
node mcp_proxy_server/proxy_client_tester.js
```

### Manual Testing

```bash
# Test with curl
curl http://localhost:8000/health
curl http://localhost:8000/proxy/github/health
curl http://localhost:8000/mcp/get_methods

# Test error cases
curl http://localhost:8000/proxy/unknown/tools
curl http://localhost:8000/invalid/endpoint
```

## Performance Considerations

### Timeouts

- **Default Request Timeout**: 30 seconds
- **Per-server Timeouts**: Configurable per downstream server
- **Health Check Timeout**: 5 seconds

### Concurrency

- The proxy server handles concurrent requests efficiently
- No request queuing - all requests are processed in parallel
- Connection pooling for downstream requests

### Monitoring

- Request counting and timing
- Downstream server health monitoring
- Automatic retry logic for health checks

## Deployment

### Docker Deployment

```bash
# Build and start with Docker Compose
docker compose up -d mcp-proxy

# Or build manually
docker build -f Dockerfile.proxy -t mcp-proxy .
docker run -p 8000:8000 mcp-proxy
```

### Production Considerations

1. **Environment Variables**: Set appropriate URLs for downstream servers
2. **Health Checks**: Enable health monitoring for production
3. **Logging**: Configure appropriate log levels
4. **CORS**: Restrict CORS origins for security
5. **Timeouts**: Adjust timeouts based on network conditions

## Troubleshooting

### Common Issues

1. **Downstream Server Connection Refused**
   - Verify downstream servers are running
   - Check network connectivity
   - Verify URLs in configuration

2. **Routing Not Working**
   - Check routing strategy configuration
   - Verify request format (prefix vs header)
   - Check available targets in error messages

3. **Health Checks Failing**
   - Verify health endpoints on downstream servers
   - Check health check intervals and timeouts
   - Review server logs for connection issues

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug node mcp_proxy_server/proxy_server.js

# Enable request logging
ENABLE_REQUEST_LOGGING=true node mcp_proxy_server/proxy_server.js
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 