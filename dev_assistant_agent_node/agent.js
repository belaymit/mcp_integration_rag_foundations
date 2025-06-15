const { RAGSetup } = require('./rag_setup');
const { MCPClient } = require('./mcp_client');
const winston = require('winston');

class DevAssistantAgent {
    constructor(options = {}) {
        this.ragSetup = new RAGSetup({
            knowledgeBasePath: options.knowledgeBasePath || './mock_knowledge_base',
            chunkSize: options.chunkSize || 1000,
            chunkOverlap: options.chunkOverlap || 200
        });
        
        this.mcpClient = new MCPClient({
            proxyUrl: options.proxyUrl || 'http://localhost:3001',
            timeout: options.timeout || 10000,
            retries: options.retries || 3
        });
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.simple()
                }),
                new winston.transports.File({ filename: 'agent.log' })
            ]
        });
        
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            this.logger.info('Initializing Dev Assistant Agent...');
            
            // Initialize RAG system
            this.logger.info('Setting up RAG system...');
            await this.ragSetup.createVectorStore();
            
            this.logger.info('Agent initialization completed successfully');
            this.isInitialized = true;
            
        } catch (error) {
            this.logger.error('Failed to initialize agent:', error);
            throw error;
        }
    }

    async processQuery(userQuery) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        try {
            this.logger.info(`Processing query: "${userQuery}"`);
            
            // Step 1: Parse the query to identify MCP operations
            const mcpAction = this.mcpClient.parseQuery(userQuery);
            this.logger.info('Parsed MCP action:', mcpAction);
            
            // Step 2: Execute MCP call if applicable
            let mcpResult = null;
            try {
                if (mcpAction.action === 'get_issue' && mcpAction.server === 'atlassian') {
                    mcpResult = await this.mcpClient.getJiraIssue(mcpAction.params.issue_key, mcpAction.server);
                } else if (mcpAction.action === 'get_issue' && mcpAction.server === 'github') {
                    // For GitHub, we need owner and repo - using defaults for demo
                    mcpResult = await this.mcpClient.getIssue('owner', 'repo', mcpAction.params.issue_number, mcpAction.server);
                } else if (mcpAction.action === 'get_user_info') {
                    mcpResult = await this.mcpClient.getUserInfo(mcpAction.params.username, mcpAction.server);
                } else if (mcpAction.action === 'list_files') {
                    mcpResult = await this.mcpClient.listFiles(mcpAction.params.path, mcpAction.server);
                } else if (mcpAction.action === 'read_file') {
                    mcpResult = await this.mcpClient.readFile(mcpAction.params.path, mcpAction.server);
                } else {
                    // Generic method invocation
                    mcpResult = await this.mcpClient.invokeMethod(mcpAction.action, mcpAction.params, mcpAction.server);
                }
                
                this.logger.info('MCP call successful');
            } catch (mcpError) {
                this.logger.warn('MCP call failed:', mcpError.message);
                mcpResult = { error: mcpError.message };
            }
            
            // Step 3: Perform RAG query to find related context
            this.logger.info('Performing RAG query...');
            const ragResults = await this.ragSetup.query(userQuery, 4);
            
            // Step 4: Synthesize response
            const response = this.synthesizeResponse(userQuery, mcpResult, ragResults);
            
            this.logger.info('Query processing completed');
            return response;
            
        } catch (error) {
            this.logger.error('Error processing query:', error);
            return {
                success: false,
                error: error.message,
                query: userQuery,
                timestamp: new Date().toISOString()
            };
        }
    }

    synthesizeResponse(query, mcpResult, ragResults) {
        const response = {
            success: true,
            query: query,
            timestamp: new Date().toISOString(),
            mcpResult: mcpResult,
            ragContext: ragResults,
            synthesizedAnswer: ''
        };
        
        // Create a synthesized answer combining MCP and RAG results
        let answer = `Based on your query "${query}", here's what I found:\n\n`;
        
        // Add MCP results
        if (mcpResult && !mcpResult.error) {
            answer += "**Direct Tool Results:**\n";
            if (mcpResult.result) {
                if (typeof mcpResult.result === 'string') {
                    answer += mcpResult.result + "\n\n";
                } else {
                    answer += JSON.stringify(mcpResult.result, null, 2) + "\n\n";
                }
            } else {
                answer += JSON.stringify(mcpResult, null, 2) + "\n\n";
            }
        } else if (mcpResult && mcpResult.error) {
            answer += `**Tool Access Issue:** ${mcpResult.error}\n\n`;
        }
        
        // Add RAG context
        if (ragResults && ragResults.length > 0) {
            answer += "**Related Context from Knowledge Base:**\n";
            ragResults.forEach((result, index) => {
                answer += `${index + 1}. **${result.metadata.type || 'Document'}** (${result.metadata.source}):\n`;
                answer += `   ${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}\n\n`;
            });
        }
        
        // Add insights and recommendations
        answer += this.generateInsights(query, mcpResult, ragResults);
        
        response.synthesizedAnswer = answer;
        return response;
    }

    generateInsights(query, mcpResult, ragResults) {
        let insights = "**Insights and Recommendations:**\n";
        
        // Analyze patterns in the data
        if (ragResults && ragResults.length > 0) {
            const sources = ragResults.map(r => r.metadata.source);
            const uniqueSources = [...new Set(sources)];
            
            insights += `- Found relevant information across ${uniqueSources.length} different sources: ${uniqueSources.join(', ')}\n`;
            
            // Look for ticket references
            const ticketRefs = ragResults.filter(r => r.metadata.type === 'ticket' || r.metadata.source === 'jira');
            if (ticketRefs.length > 0) {
                insights += `- Identified ${ticketRefs.length} related tickets that might be relevant\n`;
            }
            
            // Look for code references
            const codeRefs = ragResults.filter(r => r.metadata.type === 'code');
            if (codeRefs.length > 0) {
                insights += `- Found ${codeRefs.length} code references that might help with implementation\n`;
            }
            
            // Look for documentation
            const docRefs = ragResults.filter(r => r.metadata.type === 'documentation');
            if (docRefs.length > 0) {
                insights += `- Located ${docRefs.length} documentation files for additional context\n`;
            }
        }
        
        // MCP-specific insights
        if (mcpResult && !mcpResult.error) {
            insights += "- Successfully retrieved real-time data from external tools\n";
        } else if (mcpResult && mcpResult.error) {
            insights += "- Consider checking tool availability and authentication\n";
        }
        
        insights += "\n**Next Steps:**\n";
        insights += "- Review the related context for additional insights\n";
        insights += "- Consider cross-referencing with other tools if needed\n";
        insights += "- Check for any dependencies or related work items\n";
        
        return insights;
    }

    async getAvailableMethods(serverPrefix = 'filesystem') {
        try {
            return await this.mcpClient.getMethods(serverPrefix);
        } catch (error) {
            this.logger.error('Error getting available methods:', error);
            return { error: error.message };
        }
    }

    async healthCheck() {
        const health = {
            timestamp: new Date().toISOString(),
            initialized: this.isInitialized,
            rag: { status: 'unknown' },
            mcp: { status: 'unknown' }
        };
        
        try {
            // Check RAG system
            if (this.ragSetup.vectorStore) {
                const testQuery = await this.ragSetup.query('test', 1);
                health.rag.status = 'healthy';
                health.rag.documentsIndexed = testQuery.length >= 0;
            } else {
                health.rag.status = 'not_initialized';
            }
        } catch (error) {
            health.rag.status = 'error';
            health.rag.error = error.message;
        }
        
        try {
            // Check MCP client
            const methods = await this.mcpClient.getMethods('filesystem');
            health.mcp.status = methods.error ? 'error' : 'healthy';
            if (methods.error) {
                health.mcp.error = methods.error;
            }
        } catch (error) {
            health.mcp.status = 'error';
            health.mcp.error = error.message;
        }
        
        return health;
    }

    // Utility method for testing different query types
    async testQueries() {
        const testQueries = [
            "Tell me about JIRA ticket NEX-123",
            "List files in the code directory",
            "What is the login feature documentation about?",
            "Show me GitHub issue #5",
            "Find information about MCP server design"
        ];
        
        const results = [];
        for (const query of testQueries) {
            console.log(`\n=== Testing Query: "${query}" ===`);
            try {
                const result = await this.processQuery(query);
                results.push({ query, result, success: true });
                console.log('Result:', JSON.stringify(result, null, 2));
            } catch (error) {
                results.push({ query, error: error.message, success: false });
                console.error('Error:', error.message);
            }
        }
        
        return results;
    }
}

module.exports = { DevAssistantAgent }; 