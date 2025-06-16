#!/usr/bin/env node

const { DevAssistantAgent } = require('./agent');
const readline = require('readline');
require('dotenv').config();

class AgentRunner {
    constructor() {
        this.agent = new DevAssistantAgent({
            proxyUrl: process.env.MCP_PROXY_URL || 'http://localhost:8000',
            knowledgeBasePath: process.env.KNOWLEDGE_BASE_PATH || './mock_knowledge_base'
        });
        
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async initialize() {
        console.log(' Initializing Dev Assistant Agent...');
        try {
            await this.agent.initialize();
            console.log(' Agent initialized successfully!');
            
            // Show health check
            const health = await this.agent.healthCheck();
            console.log(' Health Check:', JSON.stringify(health, null, 2));
            
        } catch (error) {
            console.error(' Failed to initialize agent:', error.message);
            process.exit(1);
        }
    }

    async runInteractiveMode() {
        console.log('\nWelcome to Dev Assistant Agent!');
        console.log('Type your questions or commands:');
        console.log('- Ask about JIRA tickets (e.g., "Tell me about NEX-123")');
        console.log('- Query files (e.g., "List files in code directory")');
        console.log('- Search documentation (e.g., "What is login feature about?")');
        console.log('- Type "health" for health check');
        console.log('- Type "test" to run test queries');
        console.log('- Type "methods" to see available MCP methods');
        console.log('- Type "exit" to quit\n');

        this.promptUser();
    }

    promptUser() {
        this.rl.question('> ', async (input) => {
            const query = input.trim();
            
            if (query.toLowerCase() === 'exit') {
                console.log('Goodbye!');
                this.rl.close();
                process.exit(0);
            }
            
            if (query.toLowerCase() === 'health') {
                const health = await this.agent.healthCheck();
                console.log(' Health Check:', JSON.stringify(health, null, 2));
                this.promptUser();
                return;
            }
            
            if (query.toLowerCase() === 'test') {
                console.log('Running test queries...');
                await this.runTestQueries();
                this.promptUser();
                return;
            }
            
            if (query.toLowerCase() === 'methods') {
                console.log('Available MCP methods:');
                const methods = await this.agent.getAvailableMethods();
                console.log(JSON.stringify(methods, null, 2));
                this.promptUser();
                return;
            }
            
            if (query === '') {
                this.promptUser();
                return;
            }
            
            console.log('\n Processing your query...');
            try {
                const result = await this.agent.processQuery(query);
                
                if (result.success) {
                    console.log('\n Result:');
                    console.log(result.synthesizedAnswer);
                } else {
                    console.log('\n Error:', result.error);
                }
                
            } catch (error) {
                console.error('\n Unexpected error:', error.message);
            }
            
            console.log('\n' + '='.repeat(80));
            this.promptUser();
        });
    }

    async runTestQueries() {
        try {
            const results = await this.agent.testQueries();
            
            console.log('\n Test Results Summary:');
            const successful = results.filter(r => r.success).length;
            console.log(` Successful: ${successful}/${results.length}`);
            
            results.forEach((result, index) => {
                console.log(`\n${index + 1}. Query: "${result.query}"`);
                if (result.success) {
                    console.log('   Status:  Success');
                    console.log('   Answer:', result.result.synthesizedAnswer.substring(0, 200) + '...');
                } else {
                    console.log('   Status:  Failed');
                    console.log('   Error:', result.error);
                }
            });
            
        } catch (error) {
            console.error('Error running test queries:', error.message);
        }
    }

    async runSingleQuery(query) {
        await this.initialize();
        
        console.log(`\n Processing query: "${query}"`);
        try {
            const result = await this.agent.processQuery(query);
            
            if (result.success) {
                console.log('\n Result:');
                console.log(result.synthesizedAnswer);
                console.log('\n Raw Data:');
                console.log('MCP Result:', JSON.stringify(result.mcpResult, null, 2));
                console.log('RAG Context:', JSON.stringify(result.ragContext, null, 2));
            } else {
                console.log('\n Error:', result.error);
            }
            
        } catch (error) {
            console.error('\n Unexpected error:', error.message);
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const runner = new AgentRunner();
    
    if (args.length === 0) {
        // Interactive mode
        await runner.initialize();
        await runner.runInteractiveMode();
    } else if (args[0] === 'test') {
        // Test mode
        await runner.initialize();
        await runner.runTestQueries();
        process.exit(0);
    } else if (args[0] === 'health') {
        // Health check mode
        await runner.initialize();
        const health = await runner.agent.healthCheck();
        console.log(JSON.stringify(health, null, 2));
        process.exit(0);
    } else if (args[0] === 'query' && args[1]) {
        // Single query mode
        const query = args.slice(1).join(' ');
        await runner.runSingleQuery(query);
        process.exit(0);
    } else {
        console.log('Usage:');
        console.log('  node run.js                    # Interactive mode');
        console.log('  node run.js test               # Run test queries');
        console.log('  node run.js health             # Health check');
        console.log('  node run.js query "your query" # Single query');
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n Goodbye!');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error(' Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(' Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

if (require.main === module) {
    main().catch(error => {
        console.error(' Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { AgentRunner }; 