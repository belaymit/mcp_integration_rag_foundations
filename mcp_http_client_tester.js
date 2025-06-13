#!/usr/bin/env node

const axios = require('axios');

class MCPHttpClient {
    constructor() {
        this.servers = {
            filesystem: {
                name: 'Filesystem MCP Server',
                url: 'http://localhost:8001',
                status: 'unknown'
            },
            github: {
                name: 'GitHub MCP Server',
                url: 'http://localhost:8002',
                status: 'unknown'
            },
            atlassian: {
                name: 'Atlassian MCP Server',
                url: 'http://localhost:8003',
                status: 'unknown'
            }
        };
    }

    async checkServerHealth(serverKey) {
        try {
            const server = this.servers[serverKey];
            const response = await axios.get(`${server.url}/health`, { timeout: 5000 });
            server.status = response.data.server === 'running' ? 'running' : 'stopped';
            return true;
        } catch (error) {
            this.servers[serverKey].status = 'offline';
            return false;
        }
    }

    async getServerTools(serverKey) {
        try {
            const server = this.servers[serverKey];
            const response = await axios.get(`${server.url}/tools`, { timeout: 10000 });
            return response.data;
        } catch (error) {
            console.error(`Error getting tools from ${serverKey}:`, error.message);
            return { error: error.message };
        }
    }

    async invokeServerMethod(serverKey, toolName, params = {}) {
        try {
            const server = this.servers[serverKey];
            const response = await axios.post(
                `${server.url}/invoke/${toolName}`,
                params,
                { 
                    timeout: 10000,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            return response.data;
        } catch (error) {
            console.error(`Error invoking ${toolName} on ${serverKey}:`, error.message);
            return { error: error.message };
        }
    }

    async sendRawMCPRequest(serverKey, request) {
        try {
            const server = this.servers[serverKey];
            const response = await axios.post(
                `${server.url}/mcp`,
                request,
                { 
                    timeout: 10000,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            return response.data;
        } catch (error) {
            console.error(`Error sending raw MCP request to ${serverKey}:`, error.message);
            return { error: error.message };
        }
    }

    displayServerStatus() {
        console.log('\n=== MCP Server Status ===');
        Object.entries(this.servers).forEach(([key, server]) => {
            const statusIcon = server.status === 'running' ? '✅' : 
                              server.status === 'stopped' ? '⚠️' : '❌';
            console.log(`${statusIcon} ${server.name}: ${server.url} (${server.status})`);
        });
    }

    displayTools(serverKey, toolsData) {
        console.log(`\n=== Tools for ${this.servers[serverKey].name} ===`);
        
        if (toolsData.error) {
            console.log(`❌ Error: ${toolsData.error}`);
            return;
        }

        if (toolsData.result && toolsData.result.tools) {
            toolsData.result.tools.forEach((tool, index) => {
                console.log(`${index + 1}. ${tool.name}`);
                console.log(`   Description: ${tool.description}`);
                if (tool.inputSchema && tool.inputSchema.properties) {
                    const params = Object.keys(tool.inputSchema.properties);
                    console.log(`   Parameters: ${params.join(', ')}`);
                }
                console.log('');
            });
        } else {
            console.log('No tools found or unexpected response format');
        }
    }

    displayInvocationResult(serverKey, toolName, result) {
        console.log(`\n=== Result from ${toolName} on ${this.servers[serverKey].name} ===`);
        
        if (result.error) {
            console.log(`❌ Error: ${result.error}`);
            return;
        }

        if (result.result) {
            if (result.result.content) {
                result.result.content.forEach(content => {
                    if (content.type === 'text') {
                        console.log(content.text);
                    }
                });
            } else {
                console.log(JSON.stringify(result.result, null, 2));
            }
        } else {
            console.log(JSON.stringify(result, null, 2));
        }
    }

    async runComprehensiveTest() {
        console.log('🚀 Starting comprehensive MCP server testing...\n');

        // Check all server health
        console.log('📊 Checking server health...');
        for (const serverKey of Object.keys(this.servers)) {
            await this.checkServerHealth(serverKey);
        }
        this.displayServerStatus();

        // Test each server
        for (const serverKey of Object.keys(this.servers)) {
            const server = this.servers[serverKey];
            
            if (server.status === 'offline') {
                console.log(`\n⏭️ Skipping ${server.name} - server is offline`);
                continue;
            }

            console.log(`\n🔍 Testing ${server.name}...`);

            // Get tools
            console.log('Getting available tools...');
            const toolsData = await this.getServerTools(serverKey);
            this.displayTools(serverKey, toolsData);

            // Test specific methods based on server type
            if (serverKey === 'filesystem' && !toolsData.error) {
                console.log('Testing filesystem operations...');
                
                // Test list_directory
                const listResult = await this.invokeServerMethod(serverKey, 'list_directory', {
                    path: '/home/btd/Documents/mcp_integration_rag_foundations/mock_knowledge_base'
                });
                this.displayInvocationResult(serverKey, 'list_directory', listResult);

                // Test read_file
                const readResult = await this.invokeServerMethod(serverKey, 'read_file', {
                    path: '/home/btd/Documents/mcp_integration_rag_foundations/mock_knowledge_base/jira_tickets.json'
                });
                this.displayInvocationResult(serverKey, 'read_file', readResult);
            }

            if (serverKey === 'github' && !toolsData.error) {
                console.log('Testing GitHub operations...');
                
                // Test get_me (should work with any token)
                const meResult = await this.invokeServerMethod(serverKey, 'get_me', {});
                this.displayInvocationResult(serverKey, 'get_me', meResult);
            }

            if (serverKey === 'atlassian' && !toolsData.error) {
                console.log('Testing Atlassian operations...');
                
                // Test basic operations (will likely fail with dummy credentials)
                const spacesResult = await this.invokeServerMethod(serverKey, 'list_spaces', {});
                this.displayInvocationResult(serverKey, 'list_spaces', spacesResult);
            }
        }

        console.log('\n✅ Comprehensive testing completed!');
    }
}

async function main() {
    const client = new MCPHttpClient();
    
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        await client.runComprehensiveTest();
        return;
    }

    const command = args[0];
    
    switch (command) {
        case 'status':
            for (const serverKey of Object.keys(client.servers)) {
                await client.checkServerHealth(serverKey);
            }
            client.displayServerStatus();
            break;
            
        case 'tools':
            const serverKey = args[1];
            if (!serverKey || !client.servers[serverKey]) {
                console.log('Usage: node mcp_http_client_tester.js tools <server>');
                console.log('Available servers:', Object.keys(client.servers).join(', '));
                return;
            }
            const toolsData = await client.getServerTools(serverKey);
            client.displayTools(serverKey, toolsData);
            break;
            
        case 'invoke':
            const [, server, toolName, ...paramArgs] = args;
            if (!server || !toolName || !client.servers[server]) {
                console.log('Usage: node mcp_http_client_tester.js invoke <server> <tool> [params...]');
                console.log('Available servers:', Object.keys(client.servers).join(', '));
                return;
            }
            
            let params = {};
            if (paramArgs.length > 0) {
                try {
                    params = JSON.parse(paramArgs.join(' '));
                } catch (error) {
                    console.error('Invalid JSON parameters:', error.message);
                    return;
                }
            }
            
            const result = await client.invokeServerMethod(server, toolName, params);
            client.displayInvocationResult(server, toolName, result);
            break;
            
        default:
            console.log('Usage: node mcp_http_client_tester.js [command]');
            console.log('Commands:');
            console.log('  (no command) - Run comprehensive test');
            console.log('  status       - Check server status');
            console.log('  tools <server> - List tools for server');
            console.log('  invoke <server> <tool> [params] - Invoke specific tool');
            console.log('Available servers:', Object.keys(client.servers).join(', '));
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = MCPHttpClient; 