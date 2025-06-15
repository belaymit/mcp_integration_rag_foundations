const { DemoRAGSetup } = require('./rag_setup_demo');
const { MCPClient } = require('./mcp_client');

class DemoDevAssistantAgent {
    constructor(options = {}) {
        this.ragSetup = new DemoRAGSetup({
            knowledgeBasePath: options.knowledgeBasePath || './mock_knowledge_base'
        });
        
        this.mcpClient = new MCPClient({
            proxyUrl: options.proxyUrl || 'http://localhost:3001',
            timeout: options.timeout || 10000,
            retries: options.retries || 3
        });
        
        this.isInitialized = false;
        this.logger = {
            info: (msg, data) => console.log(`INFO: ${msg}`, data || ''),
            warn: (msg, data) => console.log(`WARN: ${msg}`, data || ''),
            error: (msg, data) => console.log(`ERROR: ${msg}`, data || '')
        };
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            this.logger.info('Initializing Demo Dev Assistant Agent...');
            
            // Initialize RAG system
            this.logger.info('Setting up Demo RAG system...');
            await this.ragSetup.createVectorStore();
            
            this.logger.info('Demo Agent initialization completed successfully');
            this.isInitialized = true;
            
        } catch (error) {
            this.logger.error('Failed to initialize demo agent:', error);
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
            
            // Step 2: Execute MCP call if applicable (will likely fail in demo mode)
            let mcpResult = null;
            try {
                if (mcpAction.action === 'get_issue' && mcpAction.server === 'atlassian') {
                    mcpResult = await this.mcpClient.getJiraIssue(mcpAction.params.issue_key, mcpAction.server);
                } else if (mcpAction.action === 'get_issue' && mcpAction.server === 'github') {
                    mcpResult = await this.mcpClient.getIssue('owner', 'repo', mcpAction.params.issue_number, mcpAction.server);
                } else if (mcpAction.action === 'get_user_info') {
                    mcpResult = await this.mcpClient.getUserInfo(mcpAction.params.username, mcpAction.server);
                } else if (mcpAction.action === 'list_files') {
                    mcpResult = await this.mcpClient.listFiles(mcpAction.params.path, mcpAction.server);
                } else if (mcpAction.action === 'read_file') {
                    mcpResult = await this.mcpClient.readFile(mcpAction.params.path, mcpAction.server);
                } else {
                    mcpResult = await this.mcpClient.invokeMethod(mcpAction.action, mcpAction.params, mcpAction.server);
                }
                
                this.logger.info('MCP call successful');
            } catch (mcpError) {
                this.logger.warn('MCP call failed (expected in demo mode):', mcpError.message);
                mcpResult = { 
                    error: mcpError.message,
                    note: 'Demo mode: MCP proxy server not available'
                };
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
        let answer = `**Demo Dev Assistant Response**\n\nQuery: "${query}"\n\n`;
        
        // Add MCP results
        if (mcpResult && !mcpResult.error) {
            answer += "**🔧 Direct Tool Results:**\n";
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
            answer += `**Tool Access Status:** ${mcpResult.error}\n`;
            if (mcpResult.note) {
                answer += `*Note: ${mcpResult.note}*\n\n`;
            }
        }
        
        // Add RAG context
        if (ragResults && ragResults.length > 0) {
            answer += "**Related Context from Knowledge Base:**\n";
            ragResults.forEach((result, index) => {
                answer += `${index + 1}. **${result.metadata.type || 'Document'}** (${result.metadata.source}) - Score: ${result.score}:\n`;
                answer += `   ${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}\n\n`;
            });
        } else {
            answer += "**Knowledge Base Search:** No relevant documents found.\n\n";
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
            insights += "- Demo mode: External tool integration would be available with MCP proxy server\n";
        }
        
        insights += "\n**Next Steps:**\n";
        insights += "- Review the related context for additional insights\n";
        insights += "- Start MCP proxy server for real-time tool integration\n";
        insights += "- Check for any dependencies or related work items\n";
        
        return insights;
    }

    async healthCheck() {
        const health = {
            timestamp: new Date().toISOString(),
            initialized: this.isInitialized,
            rag: { status: 'unknown' },
            mcp: { status: 'demo_mode' },
            mode: 'demo'
        };
        
        try {
            // Check RAG system
            if (this.ragSetup.isInitialized) {
                const testQuery = await this.ragSetup.query('test', 1);
                health.rag.status = 'healthy';
                health.rag.documentsIndexed = this.ragSetup.documents.length;
            } else {
                health.rag.status = 'not_initialized';
            }
        } catch (error) {
            health.rag.status = 'error';
            health.rag.error = error.message;
        }
        
        // MCP is always in demo mode for this version
        health.mcp.status = 'demo_mode';
        health.mcp.note = 'Start MCP proxy server for full functionality';
        
        return health;
    }

    async testQueries() {
        const testQueries = [
            "Tell me about JIRA ticket NEX-123",
            "What is the login feature documentation about?",
            "Find information about MCP server design",
            "Show me information about commit_abc123",
            "List files in the code directory"
        ];
        
        const results = [];
        for (const query of testQueries) {
            console.log(`\n=== Testing Query: "${query}" ===`);
            try {
                const result = await this.processQuery(query);
                results.push({ query, result, success: true });
                console.log(' Success');
                console.log('Answer:', result.synthesizedAnswer.substring(0, 300) + '...');
            } catch (error) {
                results.push({ query, error: error.message, success: false });
                console.error(' Error:', error.message);
            }
        }
        
        return results;
    }
}

module.exports = { DemoDevAssistantAgent }; 