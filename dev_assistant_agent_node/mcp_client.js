const axios = require('axios');

class MCPClient {
    constructor(options = {}) {
        this.proxyUrl = options.proxyUrl || 'http://localhost:8000';
        this.timeout = options.timeout || 10000;
        this.retries = options.retries || 3;
        
        this.axiosInstance = axios.create({
            baseURL: this.proxyUrl,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async makeRequest(method, params = {}, serverPrefix = 'filesystem') {
        const request = {
            jsonrpc: '2.0',
            id: this.generateId(),
            method: method,
            params: params
        };

        for (let attempt = 1; attempt <= this.retries; attempt++) {
            try {
                console.log(`MCP Request (attempt ${attempt}):`, JSON.stringify(request, null, 2));
                
                const response = await this.axiosInstance.post(`/proxy/${serverPrefix}/mcp`, request);
                
                if (response.data.error) {
                    throw new Error(`MCP Error: ${response.data.error.message || 'Unknown error'}`);
                }
                
                console.log('MCP Response:', JSON.stringify(response.data, null, 2));
                return response.data;
                
            } catch (error) {
                console.error(`MCP Request failed (attempt ${attempt}):`, error.message);
                
                if (attempt === this.retries) {
                    throw new Error(`MCP request failed after ${this.retries} attempts: ${error.message}`);
                }
                
                // Wait before retry (exponential backoff)
                await this.sleep(1000 * Math.pow(2, attempt - 1));
            }
        }
    }

    async getMethods(serverPrefix = 'filesystem') {
        return await this.makeRequest('get_methods', {}, serverPrefix);
    }

    async invokeMethod(methodName, params = {}, serverPrefix = 'filesystem') {
        return await this.makeRequest('invoke_method', {
            method: methodName,
            params: params
        }, serverPrefix);
    }

    // Filesystem-specific methods
    async listFiles(path = '.', serverPrefix = 'filesystem') {
        return await this.invokeMethod('list_files', { path }, serverPrefix);
    }

    async readFile(path, serverPrefix = 'filesystem') {
        return await this.invokeMethod('read_file', { path }, serverPrefix);
    }

    async writeFile(path, content, serverPrefix = 'filesystem') {
        return await this.invokeMethod('write_file', { path, content }, serverPrefix);
    }

    // GitHub-specific methods
    async getRepositoryInfo(owner, repo, serverPrefix = 'github') {
        return await this.invokeMethod('get_repository_info', { owner, repo }, serverPrefix);
    }

    async getUserInfo(username, serverPrefix = 'github') {
        return await this.invokeMethod('get_user_info', { username }, serverPrefix);
    }

    async getIssue(owner, repo, issueNumber, serverPrefix = 'github') {
        return await this.invokeMethod('get_issue', { 
            owner, 
            repo, 
            issue_number: issueNumber 
        }, serverPrefix);
    }

    // Atlassian/JIRA-specific methods
    async getJiraIssue(issueKey, serverPrefix = 'atlassian') {
        return await this.invokeMethod('get_issue', { issue_key: issueKey }, serverPrefix);
    }

    async searchJiraIssues(jql, serverPrefix = 'atlassian') {
        return await this.invokeMethod('search_issues', { jql }, serverPrefix);
    }

    // Google Drive-specific methods
    async listDriveFiles(query = '', serverPrefix = 'gdrive') {
        return await this.invokeMethod('list_files', { query }, serverPrefix);
    }

    async getDriveFile(fileId, serverPrefix = 'gdrive') {
        return await this.invokeMethod('get_file', { file_id: fileId }, serverPrefix);
    }

    // Helper methods
    generateId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Parse user query to determine target server and parameters
    parseQuery(query) {
        const queryLower = query.toLowerCase();
        
        // GitHub patterns
        if (queryLower.includes('github') || queryLower.includes('repository') || queryLower.includes('repo')) {
            const githubMatch = query.match(/github\s+issue\s+#?(\d+)/i) || 
                             query.match(/issue\s+#?(\d+)/i);
            if (githubMatch) {
                return {
                    server: 'github',
                    action: 'get_issue',
                    params: { issue_number: parseInt(githubMatch[1]) }
                };
            }
            
            const userMatch = query.match(/user\s+(\w+)/i);
            if (userMatch) {
                return {
                    server: 'github',
                    action: 'get_user_info',
                    params: { username: userMatch[1] }
                };
            }
        }
        
        // JIRA patterns
        if (queryLower.includes('jira') || queryLower.includes('ticket') || /NEX-\d+/i.test(query)) {
            const jiraMatch = query.match(/(NEX-\d+)/i);
            if (jiraMatch) {
                return {
                    server: 'atlassian',
                    action: 'get_issue',
                    params: { issue_key: jiraMatch[1] }
                };
            }
        }
        
        // File system patterns
        if (queryLower.includes('file') || queryLower.includes('directory') || queryLower.includes('list')) {
            const pathMatch = query.match(/path[:\s]+([^\s]+)/i) ||
                            query.match(/directory[:\s]+([^\s]+)/i) ||
                            query.match(/folder[:\s]+([^\s]+)/i);
            
            if (queryLower.includes('list')) {
                return {
                    server: 'filesystem',
                    action: 'list_files',
                    params: { path: pathMatch ? pathMatch[1] : '.' }
                };
            }
            
            if (queryLower.includes('read')) {
                return {
                    server: 'filesystem',
                    action: 'read_file',
                    params: { path: pathMatch ? pathMatch[1] : '.' }
                };
            }
        }
        
        // Google Drive patterns
        if (queryLower.includes('drive') || queryLower.includes('gdrive')) {
            const queryMatch = query.match(/search[:\s]+(.+)/i);
            return {
                server: 'gdrive',
                action: 'list_files',
                params: { query: queryMatch ? queryMatch[1] : '' }
            };
        }
        
        // Default to filesystem list
        return {
            server: 'filesystem',
            action: 'list_files',
            params: { path: '.' }
        };
    }
}

module.exports = { MCPClient }; 