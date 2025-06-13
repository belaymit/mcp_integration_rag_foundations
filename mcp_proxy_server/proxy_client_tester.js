/**
 * MCP Proxy Server Client Tester
 * 
 * A comprehensive client for testing the MCP proxy server functionality
 * including routing, error handling, and methods aggregation.
 */

const axios = require('axios');

class MCPProxyClientTester {
  constructor(proxyUrl = 'http://localhost:8000') {
    this.proxyUrl = proxyUrl;
    this.testResults = [];
    this.startTime = Date.now();
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
  }

  async runTest(testName, testFunction) {
    this.log(`Running test: ${testName}`);
    const startTime = Date.now();
    
    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.push({
        name: testName,
        status: 'PASS',
        duration,
        result,
      });
      
      this.log(`✅ ${testName} - PASSED (${duration}ms)`, 'success');
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.testResults.push({
        name: testName,
        status: 'FAIL',
        duration,
        error: error.message,
        details: error.response?.data || error.stack,
      });
      
      this.log(`❌ ${testName} - FAILED (${duration}ms): ${error.message}`, 'error');
      throw error;
    }
  }

  async testProxyHealth() {
    return await this.runTest('Proxy Health Check', async () => {
      const response = await axios.get(`${this.proxyUrl}/health`);
      
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      
      const requiredFields = ['status', 'uptime', 'timestamp', 'server_info'];
      for (const field of requiredFields) {
        if (!response.data.hasOwnProperty(field)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      return response.data;
    });
  }

  async testProxyInfo() {
    return await this.runTest('Proxy Server Info', async () => {
      const response = await axios.get(`${this.proxyUrl}/info`);
      
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      
      const requiredFields = ['name', 'version', 'routing_strategy', 'downstream_servers'];
      for (const field of requiredFields) {
        if (!response.data.hasOwnProperty(field)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      return response.data;
    });
  }

  async testPrefixRouting(target, endpoint = '/health') {
    return await this.runTest(`Prefix Routing - ${target}${endpoint}`, async () => {
      const response = await axios.get(`${this.proxyUrl}/proxy/${target}${endpoint}`);
      
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      
      return {
        status: response.status,
        data: response.data,
        target,
        endpoint,
      };
    });
  }

  async testHeaderRouting(target, endpoint = '/health') {
    return await this.runTest(`Header Routing - ${target}${endpoint}`, async () => {
      const response = await axios.get(`${this.proxyUrl}/mcp${endpoint}`, {
        headers: {
          'X-Target-MCP': target,
        },
      });
      
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      
      return {
        status: response.status,
        data: response.data,
        target,
        endpoint,
      };
    });
  }

  async testMethodsAggregation() {
    return await this.runTest('Methods Aggregation', async () => {
      const response = await axios.get(`${this.proxyUrl}/mcp/get_methods`);
      
      if (response.status !== 200) {
        throw new Error(`Expected status 200, got ${response.status}`);
      }
      
      const requiredFields = ['proxy_info', 'downstream_servers', 'aggregated_tools'];
      for (const field of requiredFields) {
        if (!response.data.hasOwnProperty(field)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      
      return response.data;
    });
  }

  async testPostRequest(target, endpoint = '/mcp', payload = { method: 'test' }) {
    return await this.runTest(`POST Request - ${target}${endpoint}`, async () => {
      const response = await axios.post(`${this.proxyUrl}/proxy/${target}${endpoint}`, payload);
      
      return {
        status: response.status,
        data: response.data,
        target,
        endpoint,
        payload,
      };
    });
  }

  async testErrorHandling() {
    const errorTests = [
      {
        name: 'Unknown Target Server',
        test: async () => {
          try {
            await axios.get(`${this.proxyUrl}/proxy/unknown/health`);
            throw new Error('Expected request to fail');
          } catch (error) {
            if (error.response?.status !== 400) {
              throw new Error(`Expected status 400, got ${error.response?.status}`);
            }
            return error.response.data;
          }
        },
      },
      {
        name: 'Missing Header for Header Routing',
        test: async () => {
          try {
            await axios.get(`${this.proxyUrl}/mcp/health`);
            throw new Error('Expected request to fail');
          } catch (error) {
            if (error.response?.status !== 400) {
              throw new Error(`Expected status 400, got ${error.response?.status}`);
            }
            return error.response.data;
          }
        },
      },
      {
        name: 'Invalid Endpoint',
        test: async () => {
          try {
            await axios.get(`${this.proxyUrl}/invalid/endpoint`);
            throw new Error('Expected request to fail');
          } catch (error) {
            if (error.response?.status !== 404) {
              throw new Error(`Expected status 404, got ${error.response?.status}`);
            }
            return error.response.data;
          }
        },
      },
    ];

    for (const errorTest of errorTests) {
      await this.runTest(`Error Handling - ${errorTest.name}`, errorTest.test);
    }
  }

  async testConcurrentRequests(concurrency = 5) {
    return await this.runTest(`Concurrent Requests (${concurrency})`, async () => {
      const requests = Array(concurrency).fill().map((_, i) => 
        axios.get(`${this.proxyUrl}/proxy/github/health?test=${i}`)
      );
      
      const responses = await Promise.all(requests);
      
      if (responses.length !== concurrency) {
        throw new Error(`Expected ${concurrency} responses, got ${responses.length}`);
      }
      
      return {
        concurrency,
        responses: responses.length,
        statuses: responses.map(r => r.status),
      };
    });
  }

  async testLargePayload() {
    return await this.runTest('Large Payload Handling', async () => {
      const largePayload = {
        data: 'x'.repeat(10000), // 10KB payload
        metadata: {
          size: '10KB',
          test: 'large_payload',
        },
      };
      
      const response = await axios.post(`${this.proxyUrl}/proxy/github/mcp`, largePayload);
      
      return {
        status: response.status,
        payload_size: JSON.stringify(largePayload).length,
        response_size: JSON.stringify(response.data).length,
      };
    });
  }

  async runAllTests() {
    this.log('🚀 Starting MCP Proxy Server Tests');
    this.log(`Proxy URL: ${this.proxyUrl}`);
    
    const testSuite = [
      // Basic functionality tests
      () => this.testProxyHealth(),
      () => this.testProxyInfo(),
      
      // Routing tests
      () => this.testPrefixRouting('github'),
      () => this.testPrefixRouting('filesystem'),
      () => this.testPrefixRouting('gdrive'),
      () => this.testHeaderRouting('github'),
      
      // Advanced functionality tests
      () => this.testMethodsAggregation(),
      () => this.testPostRequest('github'),
      
      // Error handling tests
      () => this.testErrorHandling(),
      
      // Performance tests
      () => this.testConcurrentRequests(),
      () => this.testLargePayload(),
    ];

    let passed = 0;
    let failed = 0;

    for (const test of testSuite) {
      try {
        await test();
        passed++;
      } catch (error) {
        failed++;
        // Continue with other tests
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const totalDuration = Date.now() - this.startTime;
    
    this.log('📊 Test Summary');
    this.log(`Total Tests: ${passed + failed}`);
    this.log(`Passed: ${passed}`);
    this.log(`Failed: ${failed}`);
    this.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    this.log(`Total Duration: ${totalDuration}ms`);

    return {
      summary: {
        total: passed + failed,
        passed,
        failed,
        success_rate: ((passed / (passed + failed)) * 100).toFixed(1),
        duration: totalDuration,
      },
      results: this.testResults,
    };
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      proxy_url: this.proxyUrl,
      summary: {
        total_tests: this.testResults.length,
        passed: this.testResults.filter(r => r.status === 'PASS').length,
        failed: this.testResults.filter(r => r.status === 'FAIL').length,
        average_duration: this.testResults.reduce((sum, r) => sum + r.duration, 0) / this.testResults.length,
      },
      detailed_results: this.testResults,
    };

    return report;
  }
}

// CLI interface
async function main() {
  const proxyUrl = process.argv[2] || 'http://localhost:8000';
  const tester = new MCPProxyClientTester(proxyUrl);
  
  try {
    const results = await tester.runAllTests();
    
    // Generate and save report
    const report = tester.generateReport();
    const fs = require('fs');
    const reportPath = `proxy_test_report_${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
    // Exit with appropriate code
    process.exit(results.summary.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = MCPProxyClientTester; 