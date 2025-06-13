# Docker Compose Setup for MCP Integration

This guide explains how to use Docker Compose to manage your MCP (Model Context Protocol) server environment.

## Prerequisites

- Docker and Docker Compose installed
- GitHub Personal Access Token (for GitHub MCP server)

## Environment Setup

1. **Create Environment File**:
   ```bash
   cp .env.example .env
   ```
   
   Or create a `.env` file with:
   ```
   GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token_here
   NODE_ENV=production
   ```

2. **Build Required Images**:
   ```bash
   # Build the filesystem MCP server image (if not already built)
   docker build -t filesystem-mcp ./mcp_server/
   ```

## Starting the Environment

To start all MCP servers:

```bash
docker compose up -d
```

This will start:
- **GitHub MCP Server** on port 8001
- **Filesystem MCP Server** on port 8002  
- **Google Drive MCP Server** on port 8005

## Checking Status

View running services:
```bash
docker compose ps
```

View logs:
```bash
# All services
docker compose logs

# Specific service
docker compose logs github-mcp
docker compose logs filesystem-mcp
docker compose logs gdrive-mcp
```

## Testing the Services

Run the MCP client tester:
```bash
docker compose run --rm mcp-tester
```

Or test individual endpoints:
```bash
# Health checks
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8005/health

# List available tools
curl http://localhost:8001/tools
curl http://localhost:8002/tools
curl http://localhost:8005/tools
```

## Stopping the Environment

When finished for the day, stop all services:

```bash
docker compose down
```

To also remove volumes:
```bash
docker compose down -v
```

## Service Details

### GitHub MCP Server
- **Port**: 8001
- **Image**: `ghcr.io/github/github-mcp-server`
- **Environment**: Requires `GITHUB_PERSONAL_ACCESS_TOKEN`

### Filesystem MCP Server
- **Port**: 8002
- **Image**: `filesystem-mcp` (custom built)
- **Volumes**: Maps `./mock_knowledge_base` to `/workspace`

### Google Drive MCP Server
- **Port**: 8005
- **Build**: Custom Dockerfile with HTTP wrapper
- **Volumes**: Maps Google Drive config directory

### MCP Tester (Optional)
- **Profile**: `testing` (only runs when explicitly requested)
- **Purpose**: Client testing and validation

## Troubleshooting

1. **Permission Issues**: Ensure Docker has proper permissions
2. **Port Conflicts**: Check if ports 8001, 8002, 8005 are available
3. **Environment Variables**: Verify `.env` file contains required tokens
4. **Image Building**: Run `docker compose build` if custom images need rebuilding

## Development Workflow

1. **Start Environment**: `docker compose up -d`
2. **Develop/Test**: Make changes to your code
3. **Rebuild if needed**: `docker compose build [service-name]`
4. **Restart service**: `docker compose restart [service-name]`
5. **Stop Environment**: `docker compose down`

This setup provides a clean, reproducible environment for MCP server development and testing. 