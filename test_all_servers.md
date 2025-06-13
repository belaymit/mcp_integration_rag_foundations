# Quick Test Guide for All MCP Servers

## Available Servers
1. **Filesystem** (Port 8001)
2. **Everything** (Port 8002) 
3. **Memory** (Port 8003)
4. **GitHub** (Port 8004)
5. **Google Drive** (Port 8005) - Mock Implementation

## Quick Start Commands

### 1. Test Filesystem Server
```bash
# Start server
node mcp_http_wrapper.js filesystem

# In another terminal:
curl http://localhost:8001/health
curl http://localhost:8001/tools
```

### 2. Test Everything Server
```bash
# Start server
node mcp_http_wrapper.js everything

# In another terminal:
curl http://localhost:8002/health
curl http://localhost:8002/tools
```

### 3. Test Memory Server
```bash
# Start server
node mcp_http_wrapper.js memory

# In another terminal:
curl http://localhost:8003/health
curl http://localhost:8003/tools
```

### 4. Test GitHub Server
```bash
# Make sure GITHUB_PERSONAL_ACCESS_TOKEN is in your .env file
# Start server
node mcp_http_wrapper.js github

# In another terminal:
curl http://localhost:8004/health
curl http://localhost:8004/tools
```

### 5. Test Google Drive Server (Mock)
```bash
# Start server
node mcp_http_wrapper.js gdrive

# In another terminal:
curl http://localhost:8005/health
curl http://localhost:8005/tools

# Test search functionality
curl -X POST http://localhost:8005/invoke/search \
  -H "Content-Type: application/json" \
  -d '{"query": "document"}'

# Test file reading
curl -X POST http://localhost:8005/invoke/read_file \
  -H "Content-Type: application/json" \
  -d '{"fileId": "1abc123def456"}'

# Search for different file types
curl -X POST http://localhost:8005/invoke/search \
  -H "Content-Type: application/json" \
  -d '{"query": "spreadsheet"}'

curl -X POST http://localhost:8005/invoke/search \
  -H "Content-Type: application/json" \
  -d '{"query": "presentation"}'
```

## Google Drive Mock Data

The mock Google Drive server includes these sample files:

1. **Sample Document.docx** (ID: 1abc123def456)
   - Type: Google Doc → Markdown
   - Content: Sample document with features list

2. **Test Spreadsheet.xlsx** (ID: 2def456ghi789)
   - Type: Google Sheet → CSV
   - Content: Employee data table

3. **Presentation.pptx** (ID: 3ghi789jkl012)
   - Type: Google Slides → Plain text
   - Content: Sample presentation slides

4. **README.md** (ID: 4jkl012mno345)
   - Type: Markdown file
   - Content: Sample README content

## Test All Servers Script

You can create a simple script to test all servers:

```bash
#!/bin/bash
echo "Testing all MCP servers..."

servers=("filesystem:8001" "everything:8002" "memory:8003" "github:8004" "gdrive:8005")

for server in "${servers[@]}"; do
    name=$(echo $server | cut -d: -f1)
    port=$(echo $server | cut -d: -f2)
    
    echo "Testing $name server on port $port..."
    
    # Test health
    health=$(curl -s http://localhost:$port/health 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "✅ $name server is healthy"
    else
        echo "❌ $name server is not responding"
    fi
    
    # Test tools
    tools=$(curl -s http://localhost:$port/tools 2>/dev/null)
    if [ $? -eq 0 ]; then
        tool_count=$(echo $tools | jq '.tools | length' 2>/dev/null || echo "unknown")
        echo "✅ $name server has $tool_count tools available"
    else
        echo "❌ $name server tools endpoint not responding"
    fi
    
    echo ""
done
```

## Environment Setup

Make sure your `.env` file contains:
```bash
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token_here
```

## Notes

- **Google Drive Mock**: No authentication required, works immediately
- **GitHub Server**: Requires valid GitHub token
- **Other Servers**: No authentication needed
- **Ports**: Each server runs on a different port to avoid conflicts
- **Background**: Use `Ctrl+C` to stop servers running in foreground

## Real Google Drive Setup

If you want to set up the real Google Drive server (not mock), follow the instructions in `google_drive_setup.md` for:
1. Google Cloud Project setup
2. OAuth 2.0 configuration
3. Authentication flow
4. Credential management 