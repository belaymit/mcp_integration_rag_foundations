#!/usr/bin/env node

const { DemoDevAssistantAgent } = require('./agent_demo');

class DemoAgentRunner {
    constructor() {
        this.agent = new DemoDevAssistantAgent({
            knowledgeBasePath: './mock_knowledge_base'
        });
    }

    async initialize() {
        console.log('Initializing Demo Dev Assistant Agent...');
        try {
            await this.agent.initialize();
            console.log('Demo Agent initialized successfully!');
            
            // Show health check
            const health = await this.agent.healthCheck();
            console.log('Health Check:', JSON.stringify(health, null, 2));
            
        } catch (error) {
            console.error(' Failed to initialize demo agent:', error.message);
            process.exit(1);
        }
    }

    async runSingleQuery(query) {
        await this.initialize();
        
        console.log(`\n🔍 Processing query: "${query}"`);
        try {
            const result = await this.agent.processQuery(query);
            
            if (result.success) {
                console.log('\n' + '='.repeat(80));
                console.log(result.synthesizedAnswer);
                console.log('='.repeat(80));
                
                console.log('\n Raw Data:');
                console.log('MCP Result:', JSON.stringify(result.mcpResult, null, 2));
                console.log('RAG Context Count:', result.ragContext.length);
            } else {
                console.log('\n Error:', result.error);
            }
            
        } catch (error) {
            console.error('\nUnexpected error:', error.message);
        }
    }

    async runTestQueries() {
        await this.initialize();
        
        console.log('\n Running Demo Test Queries...');
        const results = await this.agent.testQueries();
        
        console.log('\nTest Results Summary:');
        const successful = results.filter(r => r.success).length;
        console.log(`Successful: ${successful}/${results.length}`);
        
        return results;
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const runner = new DemoAgentRunner();
    
    if (args.length === 0) {
        // Default demo
        console.log('Demo Dev Assistant Agent');
        console.log('Running test queries to demonstrate functionality...\n');
        await runner.runTestQueries();
    } else if (args[0] === 'test') {
        // Test mode
        await runner.runTestQueries();
    } else if (args[0] === 'health') {
        // Health check mode
        await runner.initialize();
        const health = await runner.agent.healthCheck();
        console.log(JSON.stringify(health, null, 2));
    } else if (args[0] === 'query' && args[1]) {
        // Single query mode
        const query = args.slice(1).join(' ');
        await runner.runSingleQuery(query);
    } else {
        console.log('Demo Dev Assistant Agent Usage:');
        console.log('  node run_demo.js                    # Run demo test queries');
        console.log('  node run_demo.js test               # Run test queries');
        console.log('  node run_demo.js health             # Health check');
        console.log('  node run_demo.js query "your query" # Single query');
        console.log('');
        console.log('Example queries:');
        console.log('  node run_demo.js query "Tell me about NEX-123"');
        console.log('  node run_demo.js query "What is login feature about?"');
        console.log('  node run_demo.js query "Find MCP server design info"');
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n Demo finished!');
    process.exit(0);
});

if (require.main === module) {
    main().catch(error => {
        console.error(' Demo error:', error);
        process.exit(1);
    });
}

module.exports = { DemoAgentRunner }; 