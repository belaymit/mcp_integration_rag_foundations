#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');

class MCPClient {
    constructor() {
        this.requestId = 1;
        this.serverProcess = null;
        this.rl = null;
    }

    async connectToServer(command, args = [], env = {}) {
        console.log(`Connecting to MCP server: ${command} ${args.join(' ')}`);
        
        this.serverProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...env }
        });

        this.rl = readline.createInterface({
            input: this.serverProcess.stdout,
            output: process.stdout,
            terminal: false
        });

        // Handle server errors
        this.serverProcess.stderr.on('data', (data) => {
            console.error('Server error:', data.toString());
        });

        this.serverProcess.on('close', (code) => {
            console.log(`Server process exited with code ${code}`);
        });

        // Initialize the connection
        await this.sendInitialize();
    }

    async sendInitialize() {
        const initRequest = {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {
                    roots: {
                        listChanged: true
                    },
                    sampling: {}
                },
                clientInfo: {
                    name: "mcp-client-tester",
                    version: "1.0.0"
                }
            }
        };

        return this.sendRequest(initRequest);
    }

    async sendRequest(request) {
        return new Promise((resolve, reject) => {
            const requestStr = JSON.stringify(request) + '\n';
            
            console.log('Sending request:', JSON.stringify(request, null, 2));
            
            // Set up response handler
            const responseHandler = (line) => {
                try {
                    const response = JSON.parse(line);
                    if (response.id === request.id) {
                        this.rl.off('line', responseHandler);
                        console.log('Received response:', JSON.stringify(response, null, 2));
                        resolve(response);
                    }
                } catch (error) {
                    console.error('Error parsing response:', error);
                    reject(error);
                }
            };

            this.rl.on('line', responseHandler);
            
            // Send the request
            this.serverProcess.stdin.write(requestStr);
        });
    }

    async getMethods() {
        const request = {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/list"
        };

        return this.sendRequest(request);
    }

    async invokeMethod(methodName, params = {}) {
        const request = {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/call",
            params: {
                name: methodName,
                arguments: params
            }
        };

        return this.sendRequest(request);
    }

    disconnect() {
        if (this.serverProcess) {
            this.serverProcess.kill();
        }
        if (this.rl) {
            this.rl.close();
        }
    }
}

// Main function to test different servers
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: node mcp_client_tester.js <server-type> <command> [args...]');
        console.log('Server types: filesystem, github, atlassian');
        console.log('Commands: get_methods, invoke_method <method_name> [params_json]');
        console.log('');
        console.log('For GitHub server, set GITHUB_PERSONAL_ACCESS_TOKEN environment variable');
        process.exit(1);
    }

    const serverType = args[0];
    const command = args[1];
    
    const client = new MCPClient();
    
    try {
        // Configure server based on type
        let serverCommand, serverArgs, serverEnv = {};
        
        switch (serverType) {
            case 'filesystem':
                serverCommand = 'npx';
                serverArgs = ['-y', '@modelcontextprotocol/server-filesystem', './mock_knowledge_base'];
                break;
            case 'github':
                if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
                    console.error('GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required for GitHub server');
                    process.exit(1);
                }
                serverCommand = 'docker';
                serverArgs = [
                    'run', '-i', '--rm', 
                    '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN',
                    'ghcr.io/github/github-mcp-server'
                ];
                serverEnv = {
                    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN
                };
                break;
            case 'atlassian':
                serverCommand = 'node';
                serverArgs = ['./mcp_server/mcp-atlassian/dist/index.js'];
                break;
            default:
                console.error('Unknown server type:', serverType);
                process.exit(1);
        }
        
        await client.connectToServer(serverCommand, serverArgs, serverEnv);
        
        // Execute command
        switch (command) {
            case 'get_methods':
                await client.getMethods();
                break;
            case 'invoke_method':
                if (args.length < 3) {
                    console.error('invoke_method requires method name');
                    process.exit(1);
                }
                const methodName = args[2];
                const params = args[3] ? JSON.parse(args[3]) : {};
                await client.invokeMethod(methodName, params);
                break;
            default:
                console.error('Unknown command:', command);
                process.exit(1);
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.disconnect();
        // Give some time for cleanup
        setTimeout(() => process.exit(0), 1000);
    }
}

if (require.main === module) {
    main();
}

module.exports = MCPClient; 