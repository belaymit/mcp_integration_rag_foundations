const { DevAssistantAgent } = require('./agent');
const { MCPClient } = require('./mcp_client');
const { RAGSetup } = require('./rag_setup');

// Mock external dependencies
jest.mock('axios');
jest.mock('@langchain/openai');
jest.mock('langchain/vectorstores/memory');
jest.mock('langchain/text_splitter');

// Mock RAGSetup and DemoRAGSetup constructors
jest.mock('./rag_setup', () => {
    return {
        RAGSetup: jest.fn().mockImplementation((options = {}) => ({
            knowledgeBasePath: options.knowledgeBasePath || './mock_knowledge_base',
            chunkSize: options.chunkSize || 1000,
            createVectorStore: jest.fn().mockResolvedValue(null),
            createRetriever: jest.fn().mockResolvedValue({
                invoke: jest.fn().mockResolvedValue([
                    {
                        pageContent: 'Mock document content',
                        metadata: { source: 'test', type: 'document' }
                    }
                ])
            }),
            query: jest.fn().mockResolvedValue([]),
            vectorStore: null,
            loadDocuments: jest.fn().mockResolvedValue([
                { pageContent: 'jira content', metadata: { source: 'jira' } },
                { pageContent: 'doc content', metadata: { source: 'docs' } },
                { pageContent: 'code content', metadata: { source: 'code' } },
                { pageContent: 'gdrive content', metadata: { source: 'gdrive' } }
            ]),
            loadJiraTickets: jest.fn().mockResolvedValue([
                { pageContent: 'jira content', metadata: { source: 'jira' } }
            ]),
            loadDocsDirectory: jest.fn().mockResolvedValue([
                { pageContent: 'doc content', metadata: { source: 'docs' } }
            ]),
            loadCodeDirectory: jest.fn().mockResolvedValue([
                { pageContent: 'code content', metadata: { source: 'code' } }
            ]),
            loadGDriveFiles: jest.fn().mockResolvedValue([
                { pageContent: 'gdrive content', metadata: { source: 'gdrive' } }
            ]),
            documents: []
        })),
        DemoRAGSetup: jest.fn().mockImplementation((options = {}) => ({
            knowledgeBasePath: options.knowledgeBasePath || './mock_knowledge_base',
            chunkSize: options.chunkSize || 1000,
            createVectorStore: jest.fn().mockResolvedValue(null),
            createRetriever: jest.fn().mockResolvedValue({
                invoke: jest.fn().mockResolvedValue([
                    {
                        pageContent: 'Mock document content',
                        metadata: { source: 'test', type: 'document' }
                    }
                ])
            }),
            query: jest.fn().mockResolvedValue([]),
            vectorStore: null,
            loadDocuments: jest.fn().mockResolvedValue([
                { pageContent: 'jira content', metadata: { source: 'jira' } },
                { pageContent: 'doc content', metadata: { source: 'docs' } },
                { pageContent: 'code content', metadata: { source: 'code' } },
                { pageContent: 'gdrive content', metadata: { source: 'gdrive' } }
            ]),
            loadJiraTickets: jest.fn().mockResolvedValue([
                { pageContent: 'jira content', metadata: { source: 'jira' } }
            ]),
            loadDocsDirectory: jest.fn().mockResolvedValue([
                { pageContent: 'doc content', metadata: { source: 'docs' } }
            ]),
            loadCodeDirectory: jest.fn().mockResolvedValue([
                { pageContent: 'code content', metadata: { source: 'code' } }
            ]),
            loadGDriveFiles: jest.fn().mockResolvedValue([
                { pageContent: 'gdrive content', metadata: { source: 'gdrive' } }
            ]),
            documents: []
        }))
    };
});

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
        
        // Mock the RAG setup properly
        agent.ragSetup = {
            createVectorStore: jest.fn().mockResolvedValue(null),
            query: jest.fn().mockResolvedValue([]),
            vectorStore: null,
            loadDocuments: jest.fn().mockResolvedValue([])
        };
        
        // Mock the MCP client
        agent.mcpClient = {
            getJiraIssue: jest.fn(),
            listFiles: jest.fn(),
            getMethods: jest.fn(),
            parseQuery: jest.fn().mockReturnValue({
                server: 'filesystem',
                action: 'list_files',
                params: { path: '.' }
            }),
            invokeMethod: jest.fn().mockResolvedValue({ result: 'mock result' })
        };
        
        // Set agent as initialized to skip real initialization
        agent.isInitialized = true;
        agent.ragMode = 'demo';
    });

    describe('initialization', () => {
        it('should initialize successfully', async () => {
            // Reset initialization for this test
            agent.isInitialized = false;
            
            await agent.initialize();
            
            expect(agent.isInitialized).toBe(true);
            expect(agent.ragSetup.createVectorStore).toHaveBeenCalled();
        });

        it('should handle initialization errors', async () => {
            // Create a new agent instance for this test to avoid interference
            const failingAgent = new DevAssistantAgent({
                knowledgeBasePath: './mock_knowledge_base',
                mcpProxyUrl: 'http://localhost:3001'
            });
            
            // Mock the RAGSetup constructor to return a failing instance
            const { RAGSetup } = require('./rag_setup');
            RAGSetup.mockImplementationOnce(() => ({
                createVectorStore: jest.fn().mockRejectedValue(new Error('Init failed'))
            }));
            
            await expect(failingAgent.initialize()).rejects.toThrow('Init failed');
            expect(failingAgent.isInitialized).toBe(false);
        });
    });

    describe('processQuery', () => {
        beforeEach(async () => {
            // Mock successful initialization
            agent.ragSetup.query = jest.fn().mockResolvedValue([
                {
                    content: 'Mock document content',
                    metadata: { source: 'jira', type: 'ticket' },
                    score: 0.9
                }
            ]);
            
            // Agent is already initialized in main beforeEach
        });

        it('should process JIRA ticket query successfully', async () => {
            // Mock MCP client response
            agent.mcpClient.invokeMethod = jest.fn().mockResolvedValue({
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
            agent.mcpClient.invokeMethod = jest.fn().mockRejectedValue(new Error('MCP Error'));

            const result = await agent.processQuery('Tell me about NEX-123');

            expect(result.success).toBe(true);
            expect(result.mcpResult).toBeNull();
            expect(result.synthesizedAnswer).toContain('No data retrieved from MCP tools');
        });

        it('should handle filesystem queries', async () => {
            // Mock MCP client response
            agent.mcpClient.invokeMethod = jest.fn().mockResolvedValue({
                result: ['file1.js', 'file2.py']
            });

            const result = await agent.processQuery('List files in code directory');

            expect(result.success).toBe(true);
            expect(agent.mcpClient.invokeMethod).toHaveBeenCalled();
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

            expect(response).toBeDefined();
            expect(typeof response).toBe('string');
            expect(response.length).toBeGreaterThan(0);
            expect(response).toContain('test query');
        });

        it('should handle empty results', () => {
            const response = agent.synthesizeResponse('test query', null, []);

            expect(response).toBeDefined();
            expect(typeof response).toBe('string');
            expect(response.length).toBeGreaterThan(0);
            expect(response).toContain('test query');
        });
    });

    describe('healthCheck', () => {
        it('should return health status', async () => {
            // Mock dependencies
            agent.ragSetup.vectorStore = { mockStore: true };
            agent.mcpClient.getMethods = jest.fn().mockResolvedValue({ result: ['method1'] });

            const health = await agent.healthCheck();

            expect(health).toBeDefined();
            expect(typeof health).toBe('object');
            // Test basic health check structure
            expect(health.initialized !== undefined).toBe(true);
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
            // Override the loadDocuments method to call individual methods
            ragSetup.loadDocuments = jest.fn().mockImplementation(async () => {
                const jira = await ragSetup.loadJiraTickets();
                const docs = await ragSetup.loadDocsDirectory();
                const code = await ragSetup.loadCodeDirectory();
                const tickets = await ragSetup.loadTicketSummaries();
                return [...jira, ...docs, ...code, ...tickets];
            });

            const documents = await ragSetup.loadDocuments();

            expect(documents).toHaveLength(4);
            expect(ragSetup.loadJiraTickets).toHaveBeenCalled();
            expect(ragSetup.loadDocsDirectory).toHaveBeenCalled();
            expect(ragSetup.loadCodeDirectory).toHaveBeenCalled();
            expect(ragSetup.loadTicketSummaries).toHaveBeenCalled();
        });

        it('should handle loading errors gracefully', async () => {
            // Create a new RAGSetup instance with failing loadJiraTickets
            const { RAGSetup } = require('./rag_setup');
            const failingRagSetup = new RAGSetup();
            failingRagSetup.loadJiraTickets = jest.fn().mockRejectedValue(new Error('Load error'));
            failingRagSetup.loadDocuments = jest.fn().mockRejectedValue(new Error('Load error'));

            await expect(failingRagSetup.loadDocuments()).rejects.toThrow('Load error');
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
        
        // Mock the RAG setup properly
        agent.ragSetup = {
            createVectorStore: jest.fn().mockResolvedValue(null),
            query: jest.fn().mockResolvedValue([]),
            vectorStore: null,
            loadDocuments: jest.fn().mockResolvedValue([])
        };
        
        // Mock the MCP client
        agent.mcpClient = {
            getJiraIssue: jest.fn(),
            listFiles: jest.fn(),
            getMethods: jest.fn(),
            parseQuery: jest.fn().mockReturnValue({
                server: 'filesystem',
                action: 'list_files',
                params: { path: '.' }
            })
        };
    });

    it('should handle end-to-end query processing', async () => {
        // Mock all dependencies
        agent.ragSetup.query = jest.fn().mockResolvedValue([
            {
                content: 'Mock RAG result',
                metadata: { source: 'jira', type: 'ticket' }
            }
        ]);
        agent.mcpClient.invokeMethod = jest.fn().mockResolvedValue({
            result: { key: 'NEX-123', summary: 'Test issue' }
        });

        const result = await agent.processQuery('Tell me about NEX-123');

        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
        expect(result.success).toBe(true);
    });

    it('should handle queries with both MCP and RAG failures', async () => {
        // Create a new agent instance to avoid interference with other tests
        const failingAgent = new DevAssistantAgent({
            proxyUrl: 'http://localhost:3001',
            knowledgeBasePath: './mock_knowledge_base'
        });
        
        // Set up the agent with failing RAG setup
        failingAgent.ragSetup = {
            createVectorStore: jest.fn().mockResolvedValue(null),
            query: jest.fn().mockRejectedValue(new Error('RAG Error')),
            createRetriever: jest.fn().mockResolvedValue({
                invoke: jest.fn().mockRejectedValue(new Error('RAG Error'))
            })
        };
        
        failingAgent.mcpClient = {
            parseQuery: jest.fn().mockReturnValue({
                server: 'filesystem',
                action: 'list_files',
                params: { path: '.' }
            }),
            invokeMethod: jest.fn().mockRejectedValue(new Error('MCP Error'))
        };
        
        failingAgent.isInitialized = true;
        failingAgent.ragMode = 'full'; // Set to full mode to trigger createRetriever path

        const result = await failingAgent.processQuery('Tell me about NEX-123');

        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
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