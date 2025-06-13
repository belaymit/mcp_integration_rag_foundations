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
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                server: this.serverCommand,
                port: this.port,
                timestamp: new Date().toISOString()
            });
        });

        this.app.get('/tools', async (req, res) => {
            try {
                const tools = await this.getTools();
                res.json({ tools });
            } catch (error) {
                console.error('Error getting tools:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/mcp', async (req, res) => {
            try {
                const response = await this.sendMCPRequest(req.body);
                res.json(response);
            } catch (error) {
                console.error('Error in MCP request:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/invoke/:toolName', async (req, res) => {
            try {
                const response = await this.invokeTool(req.params.toolName, req.body);
                res.json(response);
            } catch (error) {
                console.error('Error invoking tool:', error);
                res.status(500).json({ error: error.message });
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
                console.log('Server log:', data.toString().trim());
            });

            this.serverProcess.on('error', (error) => {
                console.error('Server process error:', error);
                reject(error);
            });

            this.serverProcess.on('exit', (code) => {
                console.log(`Server process exited with code ${code}`);
            });

            // Wait a moment for server to start
            setTimeout(async () => {
                try {
                    await this.initializeServer();
                    console.log('Server initialized successfully');
                    resolve();
                } catch (error) {
                    console.error('Failed to initialize server:', error);
                    reject(error);
                }
            }, 2000);
        });
    }

    async initializeServer() {
        const initRequest = {
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
        };

        return this.sendMCPRequest(initRequest);
    }

    async sendMCPRequest(request) {
        return new Promise((resolve, reject) => {
            if (!this.serverProcess) {
                reject(new Error('Server process not started'));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 30000);

            const handleResponse = (data) => {
                clearTimeout(timeout);
                try {
                    const response = JSON.parse(data.toString());
                    resolve(response);
                } catch (error) {
                    reject(new Error('Invalid JSON response'));
                }
                this.serverProcess.stdout.removeListener('data', handleResponse);
            };

            this.serverProcess.stdout.on('data', handleResponse);
            this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async getTools() {
        const request = {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/list"
        };

        const response = await this.sendMCPRequest(request);
        return response.result?.tools || [];
    }

    async invokeTool(toolName, args) {
        const request = {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/call",
            params: {
                name: toolName,
                arguments: args
            }
        };

        return this.sendMCPRequest(request);
    }

    start() {
        this.app.listen(this.port, async () => {
            console.log(`MCP HTTP Wrapper running on http://localhost:${this.port}`);
            console.log('Available endpoints:');
            console.log('  GET  /health - Health check');
            console.log('  GET  /tools - List available tools');
            console.log('  POST /mcp - Raw MCP endpoint');
            console.log('  POST /invoke/:toolName - Invoke specific tool');
            
            try {
                await this.startServer();
            } catch (error) {
                console.error('Failed to start MCP server:', error);
                process.exit(1);
            }
        });
    }
}

// Server configurations
const serverConfigs = {
    filesystem: {
        port: 8001,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', './mock_knowledge_base'],
        env: {}
    },
    everything: {
        port: 8002,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
        env: {}
    },
    memory: {
        port: 8003,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        env: {}
    },
    github: {
        port: 8004,
        command: 'docker',
        args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || 'dummy_token' }
    },
    gdrive: {
        port: 8005,
        command: 'node',
        args: ['mock_gdrive_server.js'],
        env: {}
    }
};

// Get server type from command line
const serverType = process.argv[2] || 'filesystem';

if (!serverConfigs[serverType]) {
    console.error(`Unknown server type: ${serverType}`);
    console.error(`Available servers: ${Object.keys(serverConfigs).join(', ')}`);
    process.exit(1);
}

const config = serverConfigs[serverType];
const wrapper = new MCPHttpWrapper(config.port, config.command, config.args, config.env);
wrapper.start(); 