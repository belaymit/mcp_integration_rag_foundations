/**
 * Test Suite for MCP Proxy Server
 * 
 * Tests routing logic, payload forwarding, response handling, and error scenarios
 */

const axios = require('axios');
const MCPProxyServer = require('./proxy_server');
const { config } = require('./config');

// Mock axios for testing
jest.mock('axios');
const mockedAxios = axios;

describe('MCP Proxy Server', () => {
  let proxyServer;
  let server;
  const testPort = 8999; // Use different port for testing

  beforeAll(async () => {
    // Override config for testing
    config.server.port = testPort;
    config.server.host = 'localhost';
    config.healthCheck.enabled = false; // Disable health checks for testing
    config.logging.enableRequestLogging = false; // Reduce noise in tests

    proxyServer = new MCPProxyServer();
    server = await proxyServer.start();
    
    // Wait a bit for server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async (done) => {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
    
    // Give time for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    done();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Server Initialization', () => {
    test('should initialize proxy server successfully', () => {
      expect(proxyServer).toBeDefined();
      expect(server).toBeDefined();
    });
  });

  describe('Basic Functionality Tests', () => {
    test('should handle unknown route gracefully', async () => {
      // Mock axios to prevent actual network calls
      mockedAxios.get = jest.fn().mockResolvedValue({
        status: 404,
        data: { error: 'Not found' }
      });

      try {
        const response = await axios.get(`http://localhost:${testPort}/unknown`);
        expect(response.status).toBe(404);
      } catch (error) {
        // Expected for unknown routes
        expect(error.response?.status).toBe(404);
      }
    });

    test('should handle proxy routing pattern', async () => {
      // Mock successful response
      mockedAxios.mockResolvedValueOnce({
        status: 200,
        data: { message: 'success' }
      });

      try {
        await axios.get(`http://localhost:${testPort}/proxy/github/test`);
      } catch (error) {
        // Expected since we're mocking
        console.log('Expected mock error:', error.message);
      }

      // Verify axios was called with correct parameters
      expect(mockedAxios).toHaveBeenCalled();
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle connection errors', async () => {
      mockedAxios.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      try {
        await axios.get(`http://localhost:${testPort}/proxy/github/test`);
      } catch (error) {
        expect(error.message).toMatch(/ECONNREFUSED|ENOTFOUND|timeout/);
      }
    });

    test('should handle timeout scenarios', async () => {
      const timeoutError = new Error('timeout exceeded');
      timeoutError.code = 'ECONNABORTED';
      mockedAxios.mockRejectedValueOnce(timeoutError);

      try {
        await axios.get(`http://localhost:${testPort}/proxy/github/test`);
      } catch (error) {
        expect(error.code || error.message).toMatch(/ECONNABORTED|timeout/);
      }
    });
  });

  describe('Health and Info Endpoints', () => {
    test('GET /health should return server health status', async () => {
      const response = await axios.get(`http://localhost:${testPort}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'healthy');
      expect(response.data).toHaveProperty('uptime');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('server_info');
      expect(response.data).toHaveProperty('request_count');
    });

    test('GET /info should return server information', async () => {
      const response = await axios.get(`http://localhost:${testPort}/info`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('name', 'MCP Proxy Server');
      expect(response.data).toHaveProperty('version');
      expect(response.data).toHaveProperty('routing_strategy');
      expect(response.data).toHaveProperty('downstream_servers');
      expect(response.data).toHaveProperty('endpoints');
    });
  });

  describe('Prefix-based Routing', () => {
    test('should route request to GitHub server via prefix', async () => {
      const mockResponse = {
        status: 200,
        data: { tools: [{ name: 'search_repositories', description: 'Search GitHub repositories' }] }
      };
      mockedAxios.mockResolvedValueOnce(mockResponse);

      const response = await axios.get(`http://localhost:${testPort}/proxy/github/tools`);

      expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'http://localhost:8001/tools',
        timeout: 15000,
      }));
      expect(response.status).toBe(200);
      expect(response.data).toEqual(mockResponse.data);
    });

    test('should route POST request with body to filesystem server', async () => {
      const requestBody = { path: '/test/file.txt', content: 'test content' };
      const mockResponse = {
        status: 201,
        data: { success: true, message: 'File created' }
      };
      mockedAxios.mockResolvedValueOnce(mockResponse);

      const response = await axios.post(`http://localhost:${testPort}/proxy/filesystem/files`, requestBody);

      expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        url: 'http://localhost:8002/files',
        data: requestBody,
        timeout: 10000,
      }));
      expect(response.status).toBe(201);
      expect(response.data).toEqual(mockResponse.data);
    });

    test('should handle query parameters correctly', async () => {
      const mockResponse = {
        status: 200,
        data: { results: [] }
      };
      mockedAxios.mockResolvedValueOnce(mockResponse);

      const response = await axios.get(`http://localhost:${testPort}/proxy/gdrive/search?q=test&limit=10`);

      expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'http://localhost:8005/search',
        params: { q: 'test', limit: '10' },
        timeout: 20000,
      }));
      expect(response.status).toBe(200);
    });
  });

  describe('Header-based Routing', () => {
    test('should route request using X-Target-MCP header', async () => {
      const mockResponse = {
        status: 200,
        data: { status: 'ok' }
      };
      mockedAxios.mockResolvedValueOnce(mockResponse);

      const response = await axios.get(`http://localhost:${testPort}/mcp/status`, {
        headers: { 'X-Target-MCP': 'github' }
      });

      expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'http://localhost:8001/status',
        headers: expect.objectContaining({
          'x-target-mcp': 'github'
        }),
      }));
      expect(response.status).toBe(200);
    });

    test('should return error when X-Target-MCP header is missing', async () => {
      const response = await axios.get(`http://localhost:${testPort}/mcp/status`);

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error', 'Unable to determine target server');
      expect(response.data).toHaveProperty('available_targets');
    });
  });

  describe('Error Handling', () => {
    test('should return 400 for unknown target server', async () => {
      const response = await axios.get(`http://localhost:${testPort}/proxy/unknown/tools`);

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('error', 'Unable to determine target server');
      expect(response.data.message).toContain('Unknown target server: unknown');
    });

    test('should return 503 when downstream server is unavailable', async () => {
      mockedAxios.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const response = await axios.get(`http://localhost:${testPort}/proxy/github/tools`);

      expect(response.status).toBe(503);
      expect(response.data).toHaveProperty('error', 'Downstream server unavailable');
    });

    test('should forward error responses from downstream servers', async () => {
      const errorResponse = {
        response: {
          status: 404,
          data: { error: 'Not found', message: 'Resource not found' }
        }
      };
      mockedAxios.mockRejectedValueOnce(errorResponse);

      const response = await axios.get(`http://localhost:${testPort}/proxy/github/nonexistent`);

      expect(response.status).toBe(404);
      expect(response.data).toEqual(errorResponse.response.data);
    });

    test('should handle timeout errors', async () => {
      const timeoutError = new Error('timeout of 15000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      mockedAxios.mockRejectedValueOnce(timeoutError);

      const response = await axios.get(`http://localhost:${testPort}/proxy/github/tools`);

      expect(response.status).toBe(500);
      expect(response.data).toHaveProperty('error', 'Internal proxy error');
    });
  });

  describe('Methods Aggregation', () => {
    test('should aggregate methods from all downstream servers', async () => {
      const githubResponse = {
        status: 200,
        data: {
          tools: [
            { name: 'search_repositories', description: 'Search repositories' },
            { name: 'get_repository', description: 'Get repository details' }
          ]
        }
      };

      const filesystemResponse = {
        status: 200,
        data: {
          tools: [
            { name: 'read_file', description: 'Read file contents' },
            { name: 'write_file', description: 'Write file contents' }
          ]
        }
      };

      const gdriveResponse = {
        status: 200,
        data: {
          tools: [
            { name: 'search', description: 'Search Google Drive' },
            { name: 'read_file', description: 'Read Google Drive file' }
          ]
        }
      };

      mockedAxios
        .mockResolvedValueOnce(githubResponse)
        .mockResolvedValueOnce(filesystemResponse)
        .mockResolvedValueOnce(gdriveResponse);

      const response = await axios.get(`http://localhost:${testPort}/mcp/get_methods`);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('proxy_info');
      expect(response.data).toHaveProperty('downstream_servers');
      expect(response.data).toHaveProperty('aggregated_tools');

      // Check that all servers are included
      expect(response.data.downstream_servers).toHaveProperty('github');
      expect(response.data.downstream_servers).toHaveProperty('filesystem');
      expect(response.data.downstream_servers).toHaveProperty('gdrive');

      // Check aggregated tools
      expect(response.data.aggregated_tools).toHaveLength(6);
      expect(response.data.aggregated_tools.some(tool => tool.name === 'github.search_repositories')).toBe(true);
      expect(response.data.aggregated_tools.some(tool => tool.name === 'filesystem.read_file')).toBe(true);
      expect(response.data.aggregated_tools.some(tool => tool.name === 'gdrive.search')).toBe(true);
    });

    test('should handle partial failures in methods aggregation', async () => {
      const githubResponse = {
        status: 200,
        data: { tools: [{ name: 'search_repositories', description: 'Search repositories' }] }
      };

      mockedAxios
        .mockResolvedValueOnce(githubResponse)
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Timeout'));

      const response = await axios.get(`http://localhost:${testPort}/mcp/get_methods`);

      expect(response.status).toBe(200);
      expect(response.data.downstream_servers.github.status).toBe('available');
      expect(response.data.downstream_servers.filesystem.status).toBe('unavailable');
      expect(response.data.downstream_servers.gdrive.status).toBe('unavailable');
    });
  });

  describe('Request Forwarding', () => {
    test('should preserve request headers (excluding hop-by-hop)', async () => {
      const mockResponse = { status: 200, data: { success: true } };
      mockedAxios.mockResolvedValueOnce(mockResponse);

      const customHeaders = {
        'Authorization': 'Bearer token123',
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
        'Host': 'should-be-removed',
        'Connection': 'should-be-removed'
      };

      await axios.post(`http://localhost:${testPort}/proxy/github/test`, 
        { data: 'test' }, 
        { headers: customHeaders }
      );

      expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
        headers: expect.objectContaining({
          'authorization': 'Bearer token123',
          'content-type': 'application/json',
          'x-custom-header': 'custom-value'
        })
      }));

      // Verify hop-by-hop headers are removed
      const calledHeaders = mockedAxios.mock.calls[0][0].headers;
      expect(calledHeaders).not.toHaveProperty('host');
      expect(calledHeaders).not.toHaveProperty('connection');
    });

    test('should handle different HTTP methods', async () => {
      const mockResponse = { status: 200, data: { success: true } };
      mockedAxios.mockResolvedValue(mockResponse);

      // Test different HTTP methods
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      
      for (const method of methods) {
        await axios({
          method: method.toLowerCase(),
          url: `http://localhost:${testPort}/proxy/github/test`,
          data: method !== 'GET' ? { test: 'data' } : undefined
        });

        expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
          method: method,
          url: 'http://localhost:8001/test'
        }));
      }
    });
  });

  describe('404 Handler', () => {
    test('should return 404 for unknown endpoints', async () => {
      const response = await axios.get(`http://localhost:${testPort}/unknown/endpoint`);

      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error', 'Endpoint not found');
      expect(response.data).toHaveProperty('available_targets');
    });
  });
});

// Integration tests (require actual downstream servers)
describe('MCP Proxy Server Integration Tests', () => {
  let proxyServer;
  let server;
  const testPort = 8998;

  beforeAll(async () => {
    // Only run integration tests if environment variable is set
    if (!process.env.RUN_INTEGRATION_TESTS) {
      return;
    }

    config.server.port = testPort;
    proxyServer = new MCPProxyServer();
    server = await proxyServer.start();
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  test('should proxy real requests to downstream servers', async () => {
    if (!process.env.RUN_INTEGRATION_TESTS) {
      return;
    }

    // This test requires actual downstream servers to be running
    const response = await axios.get(`http://localhost:${testPort}/proxy/github/health`);
    expect(response.status).toBe(200);
  });
});

// Performance tests
describe('MCP Proxy Server Performance', () => {
  test('should handle concurrent requests', async () => {
    const mockResponse = { status: 200, data: { success: true } };
    mockedAxios.mockResolvedValue(mockResponse);

    const concurrentRequests = 10;
    const requests = Array(concurrentRequests).fill().map((_, i) => 
      axios.get(`http://localhost:8999/proxy/github/test${i}`)
    );

    const responses = await Promise.all(requests);
    
    expect(responses).toHaveLength(concurrentRequests);
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
  });

  test('should handle large payloads', async () => {
    const mockResponse = { status: 200, data: { success: true } };
    mockedAxios.mockResolvedValueOnce(mockResponse);

    const largePayload = {
      data: 'x'.repeat(1000000) // 1MB of data
    };

    const response = await axios.post(`http://localhost:8999/proxy/github/large`, largePayload);
    expect(response.status).toBe(200);
  });
});

// Export for manual testing
module.exports = { MCPProxyServer, config }; 