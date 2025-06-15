const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { Document } = require('langchain/document');
const fs = require('fs').promises;
const path = require('path');

class RAGSetup {
    constructor(options = {}) {
        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: process.env.OPENAI_API_KEY || 'demo-key',
            modelName: options.embeddingModel || 'text-embedding-ada-002'
        });
        
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: options.chunkSize || 1000,
            chunkOverlap: options.chunkOverlap || 200,
        });
        
        this.vectorStore = null;
        this.knowledgeBasePath = options.knowledgeBasePath || './mock_knowledge_base';
    }

    async loadDocuments() {
        const documents = [];
        
        try {
            // Load JIRA tickets
            const jiraTickets = await this.loadJiraTickets();
            documents.push(...jiraTickets);
            
            // Load documentation files
            const docs = await this.loadDocsDirectory();
            documents.push(...docs);
            
            // Load code files
            const codeFiles = await this.loadCodeDirectory();
            documents.push(...codeFiles);
            
            // Load ticket summaries
            const ticketSummaries = await this.loadTicketSummaries();
            documents.push(...ticketSummaries);
            
            console.log(`Loaded ${documents.length} documents for RAG indexing`);
            return documents;
            
        } catch (error) {
            console.error('Error loading documents:', error);
            throw error;
        }
    }

    async loadJiraTickets() {
        const documents = [];
        try {
            const jiraPath = path.join(this.knowledgeBasePath, 'jira_tickets.json');
            const jiraData = JSON.parse(await fs.readFile(jiraPath, 'utf8'));
            
            for (const ticket of jiraData) {
                const content = `
                Ticket ID: ${ticket.ticket_id}
                Summary: ${ticket.summary}
                Description: ${ticket.description}
                Status: ${ticket.status}
                Assignee: ${ticket.assignee || 'Unassigned'}
                Reporter: ${ticket.reporter}
                Code References: ${ticket.code_refs.join(', ')}
                Documentation References: ${ticket.doc_refs.join(', ')}
                `.trim();
                
                documents.push(new Document({
                    pageContent: content,
                    metadata: {
                        source: 'jira',
                        ticket_id: ticket.ticket_id,
                        type: 'ticket',
                        status: ticket.status
                    }
                }));
            }
        } catch (error) {
            console.error('Error loading JIRA tickets:', error);
        }
        return documents;
    }

    async loadDocsDirectory() {
        const documents = [];
        try {
            const docsPath = path.join(this.knowledgeBasePath, 'docs');
            const files = await fs.readdir(docsPath);
            
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const filePath = path.join(docsPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    
                    documents.push(new Document({
                        pageContent: content,
                        metadata: {
                            source: 'docs',
                            filename: file,
                            type: 'documentation'
                        }
                    }));
                }
            }
        } catch (error) {
            console.error('Error loading docs directory:', error);
        }
        return documents;
    }

    async loadCodeDirectory() {
        const documents = [];
        try {
            const codePath = path.join(this.knowledgeBasePath, 'code');
            const files = await fs.readdir(codePath);
            
            for (const file of files) {
                if (file.endsWith('.py') || file.endsWith('.js')) {
                    const filePath = path.join(codePath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    
                    documents.push(new Document({
                        pageContent: content,
                        metadata: {
                            source: 'code',
                            filename: file,
                            type: 'code'
                        }
                    }));
                }
            }
        } catch (error) {
            console.error('Error loading code directory:', error);
        }
        return documents;
    }

    async loadTicketSummaries() {
        const documents = [];
        try {
            const ticketsPath = path.join(this.knowledgeBasePath, 'tickets');
            const files = await fs.readdir(ticketsPath);
            
            for (const file of files) {
                if (file.endsWith('.txt')) {
                    const filePath = path.join(ticketsPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    
                    documents.push(new Document({
                        pageContent: content,
                        metadata: {
                            source: 'ticket_summaries',
                            filename: file,
                            type: 'ticket_summary'
                        }
                    }));
                }
            }
        } catch (error) {
            console.error('Error loading ticket summaries:', error);
        }
        return documents;
    }

    async createVectorStore() {
        try {
            console.log('Loading documents...');
            const documents = await this.loadDocuments();
            
            console.log('Splitting documents...');
            const splitDocs = await this.textSplitter.splitDocuments(documents);
            
            console.log('Creating vector store...');
            this.vectorStore = await MemoryVectorStore.fromDocuments(
                splitDocs,
                this.embeddings
            );
            
            console.log(`Vector store created with ${splitDocs.length} document chunks`);
            return this.vectorStore;
            
        } catch (error) {
            console.error('Error creating vector store:', error);
            throw error;
        }
    }

    async createRetriever(k = 4) {
        if (!this.vectorStore) {
            await this.createVectorStore();
        }
        
        return this.vectorStore.asRetriever({
            k: k,
            searchType: 'similarity'
        });
    }

    async query(query, k = 4) {
        if (!this.vectorStore) {
            await this.createVectorStore();
        }
        
        try {
            const results = await this.vectorStore.similaritySearch(query, k);
            return results.map(doc => ({
                content: doc.pageContent,
                metadata: doc.metadata,
                score: doc.score || 0
            }));
        } catch (error) {
            console.error('Error querying vector store:', error);
            throw error;
        }
    }
}

module.exports = { RAGSetup }; 