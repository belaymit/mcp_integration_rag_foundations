const fs = require('fs').promises;
const path = require('path');

class DemoRAGSetup {
    constructor(options = {}) {
        this.knowledgeBasePath = options.knowledgeBasePath || './mock_knowledge_base';
        this.documents = [];
        this.isInitialized = false;
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
                
                documents.push({
                    pageContent: content,
                    metadata: {
                        source: 'jira',
                        ticket_id: ticket.ticket_id,
                        type: 'ticket',
                        status: ticket.status
                    }
                });
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
                    
                    documents.push({
                        pageContent: content,
                        metadata: {
                            source: 'docs',
                            filename: file,
                            type: 'documentation'
                        }
                    });
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
                    
                    documents.push({
                        pageContent: content,
                        metadata: {
                            source: 'code',
                            filename: file,
                            type: 'code'
                        }
                    });
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
                    
                    documents.push({
                        pageContent: content,
                        metadata: {
                            source: 'ticket_summaries',
                            filename: file,
                            type: 'ticket_summary'
                        }
                    });
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
            this.documents = await this.loadDocuments();
            
            console.log(`Demo RAG setup completed with ${this.documents.length} documents`);
            this.isInitialized = true;
            return this;
            
        } catch (error) {
            console.error('Error creating vector store:', error);
            throw error;
        }
    }

    async createRetriever(k = 4) {
        if (!this.isInitialized) {
            await this.createVectorStore();
        }
        
        return {
            k: k,
            invoke: (query) => this.query(query, k)
        };
    }

    async query(query, k = 4) {
        if (!this.isInitialized) {
            await this.createVectorStore();
        }
        
        try {
            // Simple text-based similarity matching (no embeddings)
            const queryLower = query.toLowerCase();
            const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
            
            const scoredDocuments = this.documents.map(doc => {
                const contentLower = doc.pageContent.toLowerCase();
                
                // Calculate simple relevance score
                let score = 0;
                
                // Exact phrase matching (high score)
                if (contentLower.includes(queryLower)) {
                    score += 10;
                }
                
                // Individual term matching
                queryTerms.forEach(term => {
                    const termCount = (contentLower.match(new RegExp(term, 'g')) || []).length;
                    score += termCount * 2;
                });
                
                // Boost score for metadata matches
                const metadataString = JSON.stringify(doc.metadata).toLowerCase();
                queryTerms.forEach(term => {
                    if (metadataString.includes(term)) {
                        score += 5;
                    }
                });
                
                // Special boost for ticket IDs (NEX-xxx pattern)
                const ticketMatch = query.match(/NEX-\d+/i);
                if (ticketMatch && contentLower.includes(ticketMatch[0].toLowerCase())) {
                    score += 20;
                }
                
                return {
                    content: doc.pageContent,
                    metadata: doc.metadata,
                    score: score
                };
            });
            
            // Sort by score and return top k results
            const results = scoredDocuments
                .filter(doc => doc.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, k);
                
            console.log(`Demo RAG query "${query}" returned ${results.length} results`);
            return results;
            
        } catch (error) {
            console.error('Error querying vector store:', error);
            throw error;
        }
    }
}

module.exports = { DemoRAGSetup }; 