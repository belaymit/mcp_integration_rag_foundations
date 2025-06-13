#!/usr/bin/env node

// Mock Google Drive MCP Server for Testing
// This simulates the Google Drive MCP server without requiring OAuth setup

const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Mock file data
const mockFiles = [
    {
        id: "1abc123def456",
        name: "Sample Document.docx",
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: "2024-01-15T10:30:00.000Z",
        size: "2048"
    },
    {
        id: "2def456ghi789",
        name: "Test Spreadsheet.xlsx", 
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2024-01-14T15:45:00.000Z",
        size: "4096"
    },
    {
        id: "3ghi789jkl012",
        name: "Presentation.pptx",
        mimeType: "application/vnd.google-apps.presentation", 
        modifiedTime: "2024-01-13T09:15:00.000Z",
        size: "8192"
    },
    {
        id: "4jkl012mno345",
        name: "README.md",
        mimeType: "text/markdown",
        modifiedTime: "2024-01-12T14:20:00.000Z",
        size: "1024"
    }
];

// Mock file contents
const mockFileContents = {
    "1abc123def456": "# Sample Document\n\nThis is a sample Google Doc converted to Markdown.\n\n## Features\n- Document editing\n- Collaboration\n- Version history",
    "2def456ghi789": "Name,Age,Department\nJohn Doe,30,Engineering\nJane Smith,25,Marketing\nBob Johnson,35,Sales",
    "3ghi789jkl012": "Sample Presentation\n\nSlide 1: Introduction\nSlide 2: Main Content\nSlide 3: Conclusion",
    "4jkl012mno345": "# README\n\nThis is a sample README file from Google Drive.\n\n## Usage\nThis file demonstrates Google Drive integration."
};

function handleRequest(request) {
    const response = {
        jsonrpc: "2.0",
        id: request.id
    };

    try {
        switch (request.method) {
            case "initialize":
                response.result = {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        tools: {},
                        resources: {}
                    },
                    serverInfo: {
                        name: "mock-gdrive-server",
                        version: "1.0.0"
                    }
                };
                break;

            case "tools/list":
                response.result = {
                    tools: [
                        {
                            name: "search",
                            description: "Search for files in Google Drive",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: {
                                        type: "string",
                                        description: "Search query"
                                    }
                                },
                                required: ["query"]
                            }
                        },
                        {
                            name: "read_file",
                            description: "Read contents of a file from Google Drive",
                            inputSchema: {
                                type: "object", 
                                properties: {
                                    fileId: {
                                        type: "string",
                                        description: "ID of the file to read"
                                    }
                                },
                                required: ["fileId"]
                            }
                        }
                    ]
                };
                break;

            case "tools/call":
                const toolName = request.params.name;
                const args = request.params.arguments;

                if (toolName === "search") {
                    const query = args.query.toLowerCase();
                    const filteredFiles = mockFiles.filter(file => 
                        file.name.toLowerCase().includes(query) ||
                        file.mimeType.includes(query)
                    );
                    
                    response.result = {
                        content: [
                            {
                                type: "text",
                                text: `Found ${filteredFiles.length} files matching "${args.query}":\n\n` +
                                      filteredFiles.map(file => 
                                          `📄 ${file.name}\n` +
                                          `   ID: ${file.id}\n` +
                                          `   Type: ${file.mimeType}\n` +
                                          `   Modified: ${file.modifiedTime}\n` +
                                          `   Size: ${file.size} bytes\n`
                                      ).join('\n')
                            }
                        ]
                    };
                } else if (toolName === "read_file") {
                    const fileId = args.fileId;
                    const content = mockFileContents[fileId];
                    
                    if (content) {
                        const file = mockFiles.find(f => f.id === fileId);
                        response.result = {
                            content: [
                                {
                                    type: "text",
                                    text: `File: ${file.name}\n` +
                                          `Type: ${file.mimeType}\n` +
                                          `Content:\n\n${content}`
                                }
                            ]
                        };
                    } else {
                        response.error = {
                            code: -32602,
                            message: "File not found",
                            data: { fileId }
                        };
                    }
                } else {
                    response.error = {
                        code: -32601,
                        message: "Method not found",
                        data: { method: toolName }
                    };
                }
                break;

            default:
                response.error = {
                    code: -32601,
                    message: "Method not found",
                    data: { method: request.method }
                };
        }
    } catch (error) {
        response.error = {
            code: -32603,
            message: "Internal error",
            data: { error: error.message }
        };
    }

    return response;
}

// Handle incoming requests
rl.on('line', (line) => {
    try {
        const request = JSON.parse(line);
        const response = handleRequest(request);
        console.log(JSON.stringify(response));
    } catch (error) {
        const errorResponse = {
            jsonrpc: "2.0",
            id: null,
            error: {
                code: -32700,
                message: "Parse error",
                data: { error: error.message }
            }
        };
        console.log(JSON.stringify(errorResponse));
    }
});

// Handle process termination
process.on('SIGINT', () => {
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
}); 