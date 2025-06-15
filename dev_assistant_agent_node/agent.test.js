const { DevAssistantAgent } = require('./agent');
const { MCPClient } = require('./mcp_client');
const { RAGSetup } = require('./rag_setup');

// Mock external dependencies
jest.mock('axios');
jest.mock('@langchain/openai');
jest.mock('langchain/vectorstores/memory');
jest.mock('langchain/text_splitter');

describe('DevAssistantAgent', () => {
    let agent;

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
        
        // Create agent instance
        agent = new DevAssistantAgent({
            proxyUrl: 'http://localhost:3001',
            knowledgeBasePath: './mock_knowledge_base'
        });
    });

    describe('initialization', () => {
        it('should initialize successfully', async () => {
            // Mock RAG setup
            agent.ragSetup.createVectorStore = jest.fn().mockResolvedValue(null);
            
            await agent.initialize();
            
            expect(agent.isInitialized).toBe(true);
            expect(agent.ragSetup.createVectorStore).toHaveBeenCalled();
        });

        it('should handle initialization errors', async () => {
            // Mock RAG setup to throw error
            agent.ragSetup.createVectorStore = jest.fn().mockRejectedValue(new Error('Init failed'));
            
            await expect(agent.initialize()).rejects.toThrow('Init failed');
            expect(agent.isInitialized).toBe(false);
        });
    });

    describe('processQuery', () => {
        beforeEach(async () => {
            // Mock successful initialization
            agent.ragSetup.createVectorStore = jest.fn().mockResolvedValue(null);
            agent.ragSetup.query = jest.fn().mockResolvedValue([
                {
                    content: 'Mock document content',
                    metadata: { source: 'jira', type: 'ticket' },
                    score: 0.9
                }
            ]);
            
            await agent.initialize();
        });

        it('should process JIRA ticket query successfully', async () => {
            // Mock MCP client response
            agent.mcpClient.getJiraIssue = jest.fn().mockResolvedValue({
                result: {
                    key: 'NEX-123',
                    summary: 'Fix login button',
                    status: 'Done'
                }
            });

            const result = await agent.processQuery('Tell me about NEX-123');

            expect(result.success).toBe(true);
            expect(result.query).toBe('Tell me about NEX-123');
            expect(result.mcpResult).toBeDefined();
            expect(result.ragContext).toBeDefined();
            expect(result.synthesizedAnswer).toContain('NEX-123');
        });

        it('should handle MCP errors gracefully', async () => {
            // Mock MCP client to throw error
            agent.mcpClient.getJiraIssue = jest.fn().mockRejectedValue(new Error('MCP Error'));

            const result = await agent.processQuery('Tell me about NEX-123');

            expect(result.success).toBe(true);
            expect(result.mcpResult.error).toBe('MCP Error');
            expect(result.synthesizedAnswer).toContain('Tool Access Issue');
        });

        it('should handle filesystem queries', async () => {
            // Mock MCP client response
            agent.mcpClient.listFiles = jest.fn().mockResolvedValue({
                result: ['file1.js', 'file2.py']
            });

            const result = await agent.processQuery('List files in code directory');

            expect(result.success).toBe(true);
            expect(agent.mcpClient.listFiles).toHaveBeenCalledWith('code', 'filesystem');
        });
    });

    describe('synthesizeResponse', () => {
        it('should synthesize response with MCP and RAG results', () => {
            const mcpResult = { result: { key: 'NEX-123', summary: 'Test issue' } };
            const ragResults = [
                {
                    content: 'Related documentation',
                    metadata: { source: 'docs', type: 'documentation' }
                }
            ];

            const response = agent.synthesizeResponse('test query', mcpResult, ragResults);

            expect(response.success).toBe(true);
            expect(response.synthesizedAnswer).toContain('Direct Tool Results');
            expect(response.synthesizedAnswer).toContain('Related Context');
            expect(response.synthesizedAnswer).toContain('Insights and Recommendations');
        });

        it('should handle empty results', () => {
            const response = agent.synthesizeResponse('test query', null, []);

            expect(response.success).toBe(true);
            expect(response.synthesizedAnswer).toContain('test query');
        });
    });

    describe('healthCheck', () => {
        it('should return health status', async () => {
            // Mock dependencies
            agent.ragSetup.vectorStore = { mockStore: true };
            agent.ragSetup.query = jest.fn().mockResolvedValue([]);
            agent.mcpClient.getMethods = jest.fn().mockResolvedValue({ result: ['method1'] });

            const health = await agent.healthCheck();

            expect(health.initialized).toBe(false); // Not initialized in this test
            expect(health.rag).toBeDefined();
            expect(health.mcp).toBeDefined();
        });
    });
});

describe('MCPClient', () => {
    let mcpClient;

    beforeEach(() => {
        mcpClient = new MCPClient({
            proxyUrl: 'http://localhost:3001'
        });
    });

    describe('parseQuery', () => {
        it('should parse JIRA ticket queries', () => {
            const result = mcpClient.parseQuery('Tell me about NEX-123');

            expect(result.server).toBe('atlassian');
            expect(result.action).toBe('get_issue');
            expect(result.params.issue_key).toBe('NEX-123');
        });

        it('should parse GitHub issue queries', () => {
            const result = mcpClient.parseQuery('Show me GitHub issue #42');

            expect(result.server).toBe('github');
            expect(result.action).toBe('get_issue');
            expect(result.params.issue_number).toBe(42);
        });

        it('should parse file system queries', () => {
            const result = mcpClient.parseQuery('List files in path /code');

            expect(result.server).toBe('filesystem');
            expect(result.action).toBe('list_files');
            expect(result.params.path).toBe('/code');
        });

        it('should default to filesystem for unknown queries', () => {
            const result = mcpClient.parseQuery('random query');

            expect(result.server).toBe('filesystem');
            expect(result.action).toBe('list_files');
        });
    });

    describe('generateId', () => {
        it('should generate unique IDs', () => {
            const id1 = mcpClient.generateId();
            const id2 = mcpClient.generateId();

            expect(id1).not.toBe(id2);
            expect(typeof id1).toBe('string');
            expect(id1.length).toBeGreaterThan(10);
        });
    });
});

describe('RAGSetup', () => {
    let ragSetup;

    beforeEach(() => {
        ragSetup = new RAGSetup({
            knowledgeBasePath: './mock_knowledge_base'
        });
    });

    describe('constructor', () => {
        it('should initialize with default options', () => {
            const defaultRag = new RAGSetup();
            expect(defaultRag.knowledgeBasePath).toBe('./mock_knowledge_base');
        });

        it('should initialize with custom options', () => {
            const customRag = new RAGSetup({
                knowledgeBasePath: './custom_path',
                chunkSize: 500
            });
            expect(customRag.knowledgeBasePath).toBe('./custom_path');
        });
    });

    describe('loadDocuments', () => {
        beforeEach(() => {
            // Mock file system operations
            ragSetup.loadJiraTickets = jest.fn().mockResolvedValue([
                { pageContent: 'jira content', metadata: { source: 'jira' } }
            ]);
            ragSetup.loadDocsDirectory = jest.fn().mockResolvedValue([
                { pageContent: 'doc content', metadata: { source: 'docs' } }
            ]);
            ragSetup.loadCodeDirectory = jest.fn().mockResolvedValue([
                { pageContent: 'code content', metadata: { source: 'code' } }
            ]);
            ragSetup.loadTicketSummaries = jest.fn().mockResolvedValue([
                { pageContent: 'ticket summary', metadata: { source: 'ticket_summaries' } }
            ]);
        });

        it('should load all document types', async () => {
            const documents = await ragSetup.loadDocuments();

            expect(documents).toHaveLength(4);
            expect(ragSetup.loadJiraTickets).toHaveBeenCalled();
            expect(ragSetup.loadDocsDirectory).toHaveBeenCalled();
            expect(ragSetup.loadCodeDirectory).toHaveBeenCalled();
            expect(ragSetup.loadTicketSummaries).toHaveBeenCalled();
        });

        it('should handle loading errors gracefully', async () => {
            ragSetup.loadJiraTickets = jest.fn().mockRejectedValue(new Error('Load error'));

            await expect(ragSetup.loadDocuments()).rejects.toThrow('Load error');
        });
    });
});

describe('Integration Tests', () => {
    let agent;

    beforeEach(() => {
        agent = new DevAssistantAgent({
            proxyUrl: 'http://localhost:3001',
            knowledgeBasePath: './mock_knowledge_base'
        });
    });

    it('should handle end-to-end query processing', async () => {
        // Mock all dependencies
        agent.ragSetup.createVectorStore = jest.fn().mockResolvedValue(null);
        agent.ragSetup.query = jest.fn().mockResolvedValue([
            {
                content: 'Mock RAG result',
                metadata: { source: 'jira', type: 'ticket' }
            }
        ]);
        agent.mcpClient.getJiraIssue = jest.fn().mockResolvedValue({
            result: { key: 'NEX-123', summary: 'Test issue' }
        });

        const result = await agent.processQuery('Tell me about NEX-123');

        expect(result.success).toBe(true);
        expect(result.synthesizedAnswer).toContain('NEX-123');
        expect(result.mcpResult).toBeDefined();
        expect(result.ragContext).toBeDefined();
    });

    it('should handle queries with both MCP and RAG failures', async () => {
        // Mock failures
        agent.ragSetup.createVectorStore = jest.fn().mockResolvedValue(null);
        agent.ragSetup.query = jest.fn().mockRejectedValue(new Error('RAG Error'));
        agent.mcpClient.getJiraIssue = jest.fn().mockRejectedValue(new Error('MCP Error'));

        const result = await agent.processQuery('Tell me about NEX-123');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });
});

// Test utility functions
describe('Utility Functions', () => {
    describe('sleep function', () => {
        it('should resolve after specified time', async () => {
            const mcpClient = new MCPClient();
            const start = Date.now();
            
            await mcpClient.sleep(100);
            
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some timing variance
        });
    });
}); 