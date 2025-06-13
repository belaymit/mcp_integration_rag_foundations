# Google Drive MCP Server Setup Guide

## Overview
The Google Drive MCP server allows AI assistants to interact with Google Drive files, including:
- Searching for files
- Reading file contents
- Automatic format conversion (Google Docs → Markdown, Sheets → CSV, etc.)

## Prerequisites
1. Node.js (v16 or higher)
2. A Google Cloud Project
3. A Google account with access to Google Drive

## Step 1: Google Cloud Setup

### 1.1 Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "New Project"
3. Enter project name (e.g., "MCP Google Drive")
4. Click "Create"

### 1.2 Enable Google Drive API
1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it and click "Enable"

### 1.3 Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" (for personal accounts) or "Internal" (for workspace)
3. Fill in required fields:
   - App name: "MCP Google Drive Server"
   - User support email: your email
   - Developer contact email: your email
4. Click "Save and Continue"
5. On Scopes page, add: `https://www.googleapis.com/auth/drive.readonly`
6. Click "Save and Continue"

### 1.4 Create OAuth Client ID
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Desktop application"
4. Name: "MCP Google Drive Desktop"
5. Click "Create"
6. Download the JSON file
7. Rename it to `gcp-oauth.keys.json`

## Step 2: Installation and Setup

### 2.1 Install the Server
The server is already installed globally. If you need to reinstall:
```bash
npm install -g @modelcontextprotocol/server-gdrive
```

### 2.2 Set Up Credentials
1. Create a credentials directory:
```bash
mkdir -p ~/.config/mcp-gdrive
```

2. Move your OAuth keys file:
```bash
mv /path/to/downloaded/gcp-oauth.keys.json ~/.config/mcp-gdrive/
```

### 2.3 Authenticate
Run the authentication process:
```bash
npx @modelcontextprotocol/server-gdrive auth
```

This will:
- Open your browser for OAuth authentication
- Save credentials to `~/.config/mcp-gdrive/.gdrive-server-credentials.json`

## Step 3: Test the Server

### 3.1 Start the Google Drive Server
```bash
node mcp_http_wrapper.js gdrive
```

### 3.2 Test the Endpoints
In another terminal:

```bash
# Health check
curl http://localhost:8005/health

# List available tools
curl http://localhost:8005/tools

# Search for files (example)
curl -X POST http://localhost:8005/invoke/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}'
```

## Available Tools

### 1. search
- **Description**: Search for files in Google Drive
- **Input**: `{"query": "search term"}`
- **Returns**: List of files with names, IDs, and MIME types

### 2. read_file (if available)
- **Description**: Read contents of a specific file
- **Input**: `{"fileId": "google-drive-file-id"}`
- **Returns**: File contents (auto-converted format)

## File Format Conversions
The server automatically converts Google Workspace files:
- Google Docs → Markdown
- Google Sheets → CSV  
- Google Presentations → Plain text
- Google Drawings → PNG
- Other files → Native format

## Troubleshooting

### Common Issues
1. **Authentication Error**: Make sure you've completed the OAuth flow
2. **Permission Denied**: Check that your Google account has access to the files
3. **API Not Enabled**: Ensure Google Drive API is enabled in your project

### Environment Variables
You can set these environment variables for custom paths:
```bash
export GDRIVE_OAUTH_PATH="/path/to/gcp-oauth.keys.json"
export GDRIVE_CREDENTIALS_PATH="/path/to/.gdrive-server-credentials.json"
```

## Integration with Other Tools

### Add to .env file
```bash
# Add to your .env file if needed
GDRIVE_OAUTH_PATH=/home/btd/.config/mcp-gdrive/gcp-oauth.keys.json
GDRIVE_CREDENTIALS_PATH=/home/btd/.config/mcp-gdrive/.gdrive-server-credentials.json
```

### Use with MCP Client Tester
```bash
node mcp_client_tester.js
# Select Google Drive server when prompted
```

## Security Notes
- OAuth credentials are stored locally
- Server has read-only access to Google Drive
- No data is sent to external servers (except Google APIs)
- Credentials are excluded from version control

## Next Steps
1. Complete the authentication setup
2. Test basic file search functionality
3. Integrate with your AI assistant or application
4. Explore advanced features like file filtering and batch operations 