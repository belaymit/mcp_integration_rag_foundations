#!/usr/bin/env node

const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');

class MCPHttpWrapper {
    constructor(port, serverCommand, serverArgs, serverEnv = {}) {
        this.port = port;
        this.serverCommand = serverCommand;
        this.serverArgs = serverArgs;
        this.serverEnv = serverEnv;
        this.app = express();
        this.serverProcess = null;
        this.requestId = 1;
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                server: this.serverProcess ? 'running' : 'stopped',
                port: this.port 
            });
        });

        // MCP endpoint for HTTP transport
        this.app.post('/mcp', async (req, res) => {
            try {
                if (!this.serverProcess) {
                    await this.startServer();
                }

                const response = await this.sendToServer(req.body);
                res.json(response);
            } catch (error) {
                console.error('Error processing MCP request:', error);
                res.status(500).json({ 
                    error: 'Internal server error', 
                    message: error.message 
                });
            }
        });

        // Convenience endpoints
        this.app.get('/tools', async (req, res) => {
            try {
                if (!this.serverProcess) {
                    await this.startServer();
                }

                const response = await this.sendToServer({
                    jsonrpc: "2.0",
                    id: this.requestId++,
                    method: "tools/list"
                });
                res.json(response);
            } catch (error) {
                console.error('Error getting tools:', error);
                res.status(500).json({ 
                    error: 'Internal server error', 
                    message: error.message 
                });
            }
        });

        this.app.post('/invoke/:toolName', async (req, res) => {
            try {
                if (!this.serverProcess) {
                    await this.startServer();
                }

                const response = await this.sendToServer({
                    jsonrpc: "2.0",
                    id: this.requestId++,
                    method: "tools/call",
                    params: {
                        name: req.params.toolName,
                        arguments: req.body
                    }
                });
                res.json(response);
            } catch (error) {
                console.error('Error invoking tool:', error);
                res.status(500).json({ 
                    error: 'Internal server error', 
                    message: error.message 
                });
            }
        });
    }

    async startServer() {
        return new Promise((resolve, reject) => {
            console.log(`Starting MCP server: ${this.serverCommand} ${this.serverArgs.join(' ')}`);
            
            this.serverProcess = spawn(this.serverCommand, this.serverArgs, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...this.serverEnv }
            });

            this.serverProcess.stderr.on('data', (data) => {
                console.log('Server log:', data.toString());
            });

            this.serverProcess.on('close', (code) => {
                console.log(`Server process exited with code ${code}`);
                this.serverProcess = null;
            });

            this.serverProcess.on('error', (error) => {
                console.error('Server process error:', error);
                reject(error);
            });

            // Initialize the server
            this.sendToServer({
                jsonrpc: "2.0",
                id: this.requestId++,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        roots: { listChanged: true },
                        sampling: {}
                    },
                    clientInfo: {
                        name: "mcp-http-wrapper",
                        version: "1.0.0"
                    }
                }
            }).then(() => {
                console.log('Server initialized successfully');
                resolve();
            }).catch(reject);
        });
    }

    async sendToServer(request) {
        return new Promise((resolve, reject) => {
            if (!this.serverProcess) {
                reject(new Error('Server not running'));
                return;
            }

            const requestStr = JSON.stringify(request) + '\n';
            
            // Set up response handler
            const responseHandler = (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        if (response.id === request.id) {
                            this.serverProcess.stdout.off('data', responseHandler);
                            resolve(response);
                            return;
                        }
                    } catch (error) {
                        // Ignore parsing errors for non-JSON lines
                    }
                }
            };

            this.serverProcess.stdout.on('data', responseHandler);
            
            // Send the request
            this.serverProcess.stdin.write(requestStr);

            // Set timeout
            setTimeout(() => {
                this.serverProcess.stdout.off('data', responseHandler);
                reject(new Error('Request timeout'));
            }, 10000);
        });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`MCP HTTP Wrapper running on http://localhost:${this.port}`);
            console.log(`Available endpoints:`);
            console.log(`  GET  /health - Health check`);
            console.log(`  GET  /tools - List available tools`);
            console.log(`  POST /mcp - Raw MCP endpoint`);
            console.log(`  POST /invoke/:toolName - Invoke specific tool`);
        });
    }

    stop() {
        if (this.serverProcess) {
            this.serverProcess.kill();
        }
    }
}

// Configuration for different server types
const serverConfigs = {
    filesystem: {
        port: 8001,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', './mock_knowledge_base'],
        env: {}
    },
    github: {
        port: 8002,
        command: 'docker',
        args: [
            'run', '-i', '--rm', 
            '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN',
            'ghcr.io/github/github-mcp-server'
        ],
        env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || 'dummy_token'
        }
    },
    atlassian: {
        port: 8003,
        command: 'docker',
        args: [
            'run', '-i', '--rm',
            '-e', 'CONFLUENCE_URL',
            '-e', 'CONFLUENCE_USERNAME', 
            '-e', 'CONFLUENCE_API_TOKEN',
            'ghcr.io/sooperset/mcp-atlassian:latest'
        ],
        env: {
            CONFLUENCE_URL: process.env.CONFLUENCE_URL || 'https://example.atlassian.net/wiki',
            CONFLUENCE_USERNAME: process.env.CONFLUENCE_USERNAME || 'dummy@example.com',
            CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN || 'dummy_token'
        }
    }
};

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node mcp_http_wrapper.js <server-type>');
        console.log('Available server types:', Object.keys(serverConfigs).join(', '));
        console.log('\nExample: node mcp_http_wrapper.js filesystem');
        process.exit(1);
    }

    const serverType = args[0];
    const config = serverConfigs[serverType];
    
    if (!config) {
        console.error('Unknown server type:', serverType);
        console.log('Available server types:', Object.keys(serverConfigs).join(', '));
        process.exit(1);
    }

    const wrapper = new MCPHttpWrapper(
        config.port,
        config.command,
        config.args,
        config.env
    );

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        wrapper.stop();
        process.exit(0);
    });

    wrapper.start();
}

if (require.main === module) {
    main();
}

module.exports = MCPHttpWrapper; 