const { MCPClient } = require('./mcp_client');
const { RAGSetup } = require('./rag_setup');
const { DemoRAGSetup } = require('./rag_setup_demo');
const winston = require('winston');

class DevAssistantAgent {
    constructor(options = {}) {
        this.mcpClient = new MCPClient({
            proxyUrl: options.proxyUrl || 'http://localhost:8000'
        });
        
        // Configure logging
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console()
            ]
        });
        
        this.ragSetup = null;
        this.isInitialized = false;
        this.ragMode = 'full'; // 'full' or 'demo'
        this.knowledgeBasePath = options.knowledgeBasePath || './mock_knowledge_base';
    }

    async initialize() {
        this.logger.info('Initializing Dev Assistant Agent...');
        
        try {
            // Try to initialize full RAG first
            this.logger.info('Attempting to set up full RAG system...');
            this.ragSetup = new RAGSetup({
                knowledgeBasePath: this.knowledgeBasePath
            });
            
            await this.ragSetup.createVectorStore();
            this.ragMode = 'full';
            this.logger.info('Full RAG system initialized successfully');
            
        } catch (error) {
            // If full RAG fails (likely due to API key), fallback to demo
            if (error.message.includes('401') || error.message.includes('API key') || error.message.includes('Authentication')) {
                this.logger.warn('Full RAG initialization failed due to API key issue. Falling back to demo RAG...');
                
                try {
                    this.ragSetup = new DemoRAGSetup({
                        knowledgeBasePath: this.knowledgeBasePath
                    });
                    
                    await this.ragSetup.createVectorStore();
                    this.ragMode = 'demo';
                    this.logger.info('Demo RAG system initialized successfully');
                } catch (demoError) {
                    this.logger.error('Both full and demo RAG initialization failed:', demoError.message);
                    throw demoError;
                }
            } else {
                this.logger.error('RAG initialization failed:', error.message);
                throw error;
            }
        }
        
        this.isInitialized = true;
        this.logger.info('Agent initialization completed successfully');
    }

    async processQuery(query) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        this.logger.info('Processing query: ' + query);
        
        try {
            // Parse query to determine MCP action
            const mcpAction = this.mcpClient.parseQuery(query);
            this.logger.info('Parsed MCP action:', mcpAction);
            
            // Attempt MCP call
            let mcpResult = null;
            try {
                mcpResult = await this.mcpClient.invokeMethod(
                    mcpAction.action,
                    mcpAction.params,
                    mcpAction.server
                );
                this.logger.info('MCP call successful');
            } catch (mcpError) {
                this.logger.warn('MCP call failed: ' + mcpError.message);
            }
            
            // Perform RAG query
            this.logger.info('Performing RAG query...');
            let ragContext = [];
            
            try {
                if (this.ragMode === 'demo') {
                    ragContext = await this.ragSetup.query(query);
                } else {
                    const retriever = await this.ragSetup.createRetriever();
                    const docs = await retriever.invoke(query);
                    ragContext = docs.map(doc => ({
                        content: doc.pageContent,
                        metadata: doc.metadata,
                        score: 1 // Full RAG doesn't provide scores
                    }));
                }
            } catch (ragError) {
                this.logger.error('RAG query failed:', ragError.message);
                throw ragError;
            }
            
            // Synthesize response
            const synthesizedAnswer = this.synthesizeResponse(query, mcpResult, ragContext);
            
            this.logger.info('Query processing completed');
            
            return {
                success: true,
                query: query,
                mcpResult: mcpResult,
                ragContext: ragContext,
                synthesizedAnswer: synthesizedAnswer,
                timestamp: new Date().toISOString(),
                ragMode: this.ragMode
            };
            
        } catch (error) {
            this.logger.error('Error processing query:', error);
            return {
                success: false,
                error: error.message,
                query: query,
                timestamp: new Date().toISOString(),
                ragMode: this.ragMode
            };
        }
    }

    synthesizeResponse(query, mcpResult, ragContext) {
        const mode = this.ragMode === 'demo' ? 'Demo' : 'Production';
        let response = `**${mode} Dev Assistant Response**\n\nQuery: "${query}"\n\n`;
        
        // Add MCP tool results
        if (mcpResult && mcpResult.result) {
            response += `**Tool Access Results:**\n`;
            response += JSON.stringify(mcpResult.result, null, 2) + '\n\n';
        } else {
            response += `**Tool Access Status:** No data retrieved from MCP tools\n`;
            if (this.ragMode === 'demo') {
                response += `*Note: Demo mode - external tool access simulated*\n\n`;
            } else {
                response += `*Note: MCP proxy server may not be available*\n\n`;
            }
        }
        
        // Add RAG context
        if (ragContext && ragContext.length > 0) {
            response += `**Related Context from Knowledge Base:**\n`;
            ragContext.forEach((doc, index) => {
                const source = doc.metadata?.source || 'unknown';
                const score = doc.score ? ` - Score: ${doc.score}` : '';
                response += `${index + 1}. **${source}** (${doc.metadata?.type || 'document'})${score}:\n`;
                response += doc.content.substring(0, 300) + '...\n\n';
            });
        } else {
            response += `**Knowledge Base Search:** No relevant documents found.\n\n`;
        }
        
        // Add insights and recommendations
        response += `**Insights and Recommendations:**\n`;
        if (ragContext.length > 0) {
            response += `- Found ${ragContext.length} relevant documents in knowledge base\n`;
            response += `- Consider reviewing the retrieved context for detailed information\n`;
        }
        
        if (query.toLowerCase().includes('nex-') || query.toLowerCase().includes('ticket')) {
            response += `- For JIRA tickets, consider checking status and related code references\n`;
        }
        
        if (query.toLowerCase().includes('file') || query.toLowerCase().includes('code')) {
            response += `- For file operations, ensure proper permissions and paths\n`;
        }
        
        response += `\n*Assistant Mode: ${mode} RAG (${this.ragMode === 'demo' ? 'Text similarity' : 'Vector embeddings'})*`;
        
        return response;
    }

    async healthCheck() {
        let ragStatus = 'unknown';
        let ragError = null;
        let documentsIndexed = 0;
        
        try {
            if (this.ragSetup) {
                if (this.ragMode === 'demo') {
                    documentsIndexed = this.ragSetup.documents?.length || 0;
                } else {
                    // For full RAG, we'd need to check the vector store
                    documentsIndexed = 'unknown';
                }
                ragStatus = 'healthy';
            } else {
                ragStatus = 'not_initialized';
            }
        } catch (error) {
            ragStatus = 'error';
            ragError = error.message;
        }
        
        let mcpStatus = 'unknown';
        let mcpError = null;
        
        try {
            await this.mcpClient.getMethods('filesystem');
            mcpStatus = 'healthy';
        } catch (error) {
            mcpStatus = 'error';
            mcpError = error.message;
        }
        
        return {
            timestamp: new Date().toISOString(),
            initialized: this.isInitialized,
            ragMode: this.ragMode,
            rag: {
                status: ragStatus,
                documentsIndexed: documentsIndexed,
                error: ragError
            },
            mcp: {
                status: mcpStatus,
                error: mcpError
            }
        };
    }

    async getAvailableMethods() {
        try {
            const methods = await this.mcpClient.getMethods();
            return methods;
        } catch (error) {
            this.logger.error('Failed to get available methods:', error.message);
            return { error: error.message };
        }
    }

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
                results.push({
                    query: query,
                    success: result.success,
                    result: result,
                    error: result.error
                });
                console.log(result.success ? ' Success' : ` Failed: ${result.error}`);
                if (result.success) {
                    console.log('Answer:', result.synthesizedAnswer.substring(0, 500) + '...');
                }
            } catch (error) {
                results.push({
                    query: query,
                    success: false,
                    error: error.message
                });
                console.log(` Error: ${error.message}`);
            }
        }
        
        return results;
    }
}

module.exports = { DevAssistantAgent }; 