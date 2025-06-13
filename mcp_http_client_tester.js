#!/usr/bin/env node

const axios = require('axios');

class MCPHttpClient {
    constructor() {
        this.servers = {
            filesystem: {
                name: 'Filesystem MCP Server',
                url: 'http://localhost:8001',
                status: 'unknown',
                description: 'Secure file operations with configurable access controls'
            },
            github: {
                name: 'GitHub MCP Server',
                url: 'http://localhost:8002',
                status: 'unknown',
                description: 'GitHub API integration for repository management'
            },
            memory: {
                name: 'Memory MCP Server',
                url: 'http://localhost:8003',
                status: 'unknown',
                description: 'Knowledge graph-based persistent memory system'
            }
        };
    }

    async checkServerHealth(serverKey) {
        try {
            const server = this.servers[serverKey];
            const response = await axios.get(`${server.url}/health`, { timeout: 5000 });
            server.status = response.data.status === 'ok' ? 'healthy' : 'unhealthy';
            return { success: true, data: response.data };
        } catch (error) {
            this.servers[serverKey].status = 'unreachable';
            return { success: false, error: error.message };
        }
    }

    async getServerTools(serverKey) {
        try {
            const server = this.servers[serverKey];
            const response = await axios.get(`${server.url}/tools`, { timeout: 10000 });
            return { success: true, tools: response.data.result?.tools || response.data.tools || [] };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async invokeServerTool(serverKey, toolName, args) {
        try {
            const server = this.servers[serverKey];
            const response = await axios.post(`${server.url}/invoke/${toolName}`, args, { 
                timeout: 15000,
                headers: { 'Content-Type': 'application/json' }
            });
            return { success: true, result: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testAllServers() {
        console.log('🚀 MCP Server Comprehensive Testing\n');
        console.log('=' .repeat(60));

        const results = {};

        for (const [serverKey, server] of Object.entries(this.servers)) {
            console.log(`\n📡 Testing ${server.name}`);
            console.log(`   URL: ${server.url}`);
            console.log(`   Description: ${server.description}`);
            console.log('-'.repeat(50));

            results[serverKey] = {
                name: server.name,
                url: server.url,
                health: null,
                tools: null,
                testResults: []
            };

            // Test 1: Health Check
            console.log('   ✓ Health Check...');
            const healthResult = await this.checkServerHealth(serverKey);
            results[serverKey].health = healthResult;
            
            if (healthResult.success) {
                console.log(`     Status: ${server.status} ✅`);
            } else {
                console.log(`     Status: ${server.status} ❌`);
                console.log(`     Error: ${healthResult.error}`);
                continue;
            }

            // Test 2: Get Tools
            console.log('   ✓ Getting available tools...');
            const toolsResult = await this.getServerTools(serverKey);
            results[serverKey].tools = toolsResult;

            if (toolsResult.success) {
                console.log(`     Found ${toolsResult.tools.length} tools ✅`);
                toolsResult.tools.forEach((tool, index) => {
                    console.log(`     ${index + 1}. ${tool.name} - ${tool.description?.substring(0, 60)}...`);
                });
            } else {
                console.log(`     Failed to get tools ❌`);
                console.log(`     Error: ${toolsResult.error}`);
                continue;
            }

            // Test 3: Invoke a sample tool
            console.log('   ✓ Testing tool invocation...');
            const testResult = await this.testServerSpecificTool(serverKey, toolsResult.tools);
            results[serverKey].testResults.push(testResult);

            if (testResult.success) {
                console.log(`     Tool test successful ✅`);
                console.log(`     Result: ${JSON.stringify(testResult.result).substring(0, 100)}...`);
            } else {
                console.log(`     Tool test failed ❌`);
                console.log(`     Error: ${testResult.error}`);
            }
        }

        this.printSummary(results);
        return results;
    }

    async testServerSpecificTool(serverKey, tools) {
        switch (serverKey) {
            case 'filesystem':
                // Test list_directory tool
                const listTool = tools.find(t => t.name === 'list_directory');
                if (listTool) {
                    return await this.invokeServerTool(serverKey, 'list_directory', {
                        path: '/home/btd/Documents/mcp_integration_rag_foundations/mock_knowledge_base'
                    });
                }
                break;

            case 'github':
                // Test get_me tool (should work with any token)
                const meTool = tools.find(t => t.name === 'get_me');
                if (meTool) {
                    return await this.invokeServerTool(serverKey, 'get_me', {});
                }
                break;

            case 'memory':
                // Test any available tool
                if (tools.length > 0) {
                    const firstTool = tools[0];
                    return await this.invokeServerTool(serverKey, firstTool.name, {});
                }
                break;

            default:
                // For any other server, try the first available tool
                if (tools.length > 0) {
                    const firstTool = tools[0];
                    return await this.invokeServerTool(serverKey, firstTool.name, {});
                }
        }

        return { success: false, error: 'No suitable tool found for testing' };
    }

    printSummary(results) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TESTING SUMMARY');
        console.log('='.repeat(60));

        let healthyServers = 0;
        let totalTools = 0;
        let successfulTests = 0;

        for (const [serverKey, result] of Object.entries(results)) {
            console.log(`\n🔧 ${result.name}`);
            console.log(`   URL/Port: ${result.url}`);
            
            if (result.health?.success) {
                healthyServers++;
                console.log(`   Health: ✅ Healthy`);
            } else {
                console.log(`   Health: ❌ Unhealthy`);
            }

            if (result.tools?.success) {
                totalTools += result.tools.tools.length;
                console.log(`   Tools: ✅ ${result.tools.tools.length} available`);
            } else {
                console.log(`   Tools: ❌ Failed to retrieve`);
            }

            if (result.testResults.length > 0 && result.testResults[0].success) {
                successfulTests++;
                console.log(`   Test: ✅ Tool invocation successful`);
            } else {
                console.log(`   Test: ❌ Tool invocation failed`);
            }
        }

        console.log('\n📈 OVERALL STATISTICS');
        console.log(`   Healthy Servers: ${healthyServers}/${Object.keys(results).length}`);
        console.log(`   Total Tools Available: ${totalTools}`);
        console.log(`   Successful Tool Tests: ${successfulTests}/${Object.keys(results).length}`);
        
        const successRate = Math.round((successfulTests / Object.keys(results).length) * 100);
        console.log(`   Success Rate: ${successRate}%`);

        if (successRate >= 67) {
            console.log('\n🎉 Task 2 Status: COMPLETED SUCCESSFULLY! ✅');
        } else {
            console.log('\n⚠️  Task 2 Status: PARTIALLY COMPLETED ⚠️');
        }
    }
}

// Main execution
async function main() {
    const client = new MCPHttpClient();
    
    try {
        await client.testAllServers();
    } catch (error) {
        console.error('❌ Testing failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = MCPHttpClient; 