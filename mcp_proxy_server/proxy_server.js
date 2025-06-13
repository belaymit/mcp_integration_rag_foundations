/**
 * MCP Proxy Server
 * 
 * A proxy/gateway server that routes MCP requests to appropriate downstream servers
 * based on configurable routing strategies (prefix-based or header-based).
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { 
  config, 
  validateConfig, 
  getDownstreamServer, 
  getAllDownstreamServers, 
  getServerInfo 
} = require('./config');

class MCPProxyServer {
  constructor() {
    this.app = express();
    this.downstreamHealthStatus = new Map();
    this.requestCounter = 0;
    this.startTime = Date.now();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupHealthChecking();
  }

  setupMiddleware() {
    // CORS middleware
    if (config.cors.enabled) {
      this.app.use(cors({
        origin: config.cors.origin,
        methods: config.cors.methods,
        allowedHeaders: config.cors.allowedHeaders,
      }));
    }

    // JSON parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    if (config.logging.enableRequestLogging) {
      this.app.use((req, res, next) => {
        this.requestCounter++;
        const startTime = Date.now();
        
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Request #${this.requestCounter}`);
        
        res.on('finish', () => {
          const duration = Date.now() - startTime;
          console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        });
        
        next();
      });
    }
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const uptime = Date.now() - this.startTime;
      const healthStatus = {
        status: 'healthy',
        uptime: uptime,
        timestamp: new Date().toISOString(),
        server_info: getServerInfo(),
        downstream_health: Object.fromEntries(this.downstreamHealthStatus),
        request_count: this.requestCounter,
      };
      
      res.json(healthStatus);
    });

    // Server info endpoint
    this.app.get('/info', (req, res) => {
      res.json(getServerInfo());
    });

    // Aggregated methods endpoint
    this.app.get('/mcp/get_methods', async (req, res) => {
      try {
        const aggregatedMethods = await this.aggregateGetMethods();
        res.json(aggregatedMethods);
      } catch (error) {
        console.error('Error aggregating methods:', error.message);
        res.status(500).json({
          error: 'Failed to aggregate methods from downstream servers',
          details: error.message,
        });
      }
    });

    // Main proxy endpoints - use middleware approach
    this.app.all('/proxy/*', (req, res) => {
      this.handleProxyRequest(req, res, 'prefix');
    });

    this.app.all('/mcp/*', (req, res) => {
      this.handleProxyRequest(req, res, 'header');
    });

    this.app.all('/mcp', (req, res) => {
      this.handleProxyRequest(req, res, 'header');
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        message: 'Available endpoints: /health, /info, /mcp/get_methods, /proxy/{target}/*',
        available_targets: Object.keys(config.downstreamServers),
      });
    });
  }

  async handleProxyRequest(req, res, routingContext) {
    try {
      // Determine target server
      const targetInfo = this.determineTarget(req, routingContext);
      
      if (!targetInfo.server) {
        return res.status(400).json({
          error: 'Unable to determine target server',
          message: targetInfo.error || 'No valid routing information provided',
          available_targets: Object.keys(config.downstreamServers),
          routing_strategy: config.routing.strategy,
        });
      }

      // Check if target server is healthy
      if (!this.isServerHealthy(targetInfo.target)) {
        return res.status(503).json({
          error: 'Target server unavailable',
          target: targetInfo.target,
          message: 'The target MCP server is currently unavailable',
        });
      }

      // Forward the request
      const response = await this.forwardRequest(targetInfo, req);
      
      // Return the response
      res.status(response.status).json(response.data);
      
    } catch (error) {
      console.error('Proxy request error:', error.message);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        res.status(503).json({
          error: 'Downstream server unavailable',
          message: 'Unable to connect to the target MCP server',
          details: error.message,
        });
      } else if (error.response) {
        // Forward error response from downstream server
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({
          error: 'Internal proxy error',
          message: error.message,
        });
      }
    }
  }

  determineTarget(req, routingContext) {
    let target = null;
    let targetPath = req.path;
    let error = null;

    switch (routingContext) {
      case 'prefix':
        // Extract target from URL path: /proxy/{target}/...
        const pathParts = req.path.split('/');
        if (pathParts.length >= 3 && pathParts[1] === 'proxy') {
          target = pathParts[2];
          targetPath = '/' + pathParts.slice(3).join('/');
          if (targetPath === '/') targetPath = '/';
        }
        break;

      case 'header':
        // Extract target from header
        target = req.headers[config.routing.targetHeader.toLowerCase()];
        if (!target && config.routing.strategy === 'header') {
          error = `Missing ${config.routing.targetHeader} header`;
        }
        // For header routing, use the path after /mcp
        if (req.path.startsWith('/mcp')) {
          targetPath = req.path.substring(4) || '/';
        }
        break;

      case 'fallback':
        // Use default server if configured
        target = config.routing.defaultServer;
        if (!target) {
          error = 'No default server configured and no routing information provided';
        }
        break;
    }

    const server = target ? getDownstreamServer(target) : null;
    
    if (target && !server) {
      error = `Unknown target server: ${target}`;
    }

    return {
      target,
      server,
      targetPath,
      error,
    };
  }

  async forwardRequest(targetInfo, req) {
    const { server, targetPath } = targetInfo;
    
    // Construct the full URL for the downstream server
    const targetUrl = `${server.url}${targetPath}`;
    
    // Prepare headers (exclude hop-by-hop headers)
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;
    delete forwardHeaders.connection;
    delete forwardHeaders['content-length'];
    
    // Prepare request configuration
    const requestConfig = {
      method: req.method,
      url: targetUrl,
      headers: forwardHeaders,
      timeout: server.timeout || config.server.timeout,
      validateStatus: () => true, // Don't throw on HTTP error status codes
    };

    // Add request body for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
      requestConfig.data = req.body;
    }

    // Add query parameters
    if (Object.keys(req.query).length > 0) {
      requestConfig.params = req.query;
    }

    console.log(`Forwarding ${req.method} request to: ${targetUrl}`);
    
    return await axios(requestConfig);
  }

  async aggregateGetMethods() {
    const allMethods = {
      proxy_info: getServerInfo(),
      downstream_servers: {},
      aggregated_tools: [],
    };

    const promises = getAllDownstreamServers().map(async (server) => {
      try {
        const response = await axios.get(`${server.url}/tools`, {
          timeout: server.timeout || 10000,
        });
        
        allMethods.downstream_servers[server.id] = {
          status: 'available',
          url: server.url,
          description: server.description,
          tools: response.data.tools || response.data,
        };

        // Add tools to aggregated list with server prefix
        if (response.data.tools) {
          response.data.tools.forEach(tool => {
            allMethods.aggregated_tools.push({
              ...tool,
              server: server.id,
              name: `${server.id}.${tool.name}`,
            });
          });
        }
        
      } catch (error) {
        console.error(`Failed to get methods from ${server.id}:`, error.message);
        allMethods.downstream_servers[server.id] = {
          status: 'unavailable',
          url: server.url,
          description: server.description,
          error: error.message,
        };
      }
    });

    await Promise.all(promises);
    return allMethods;
  }

  setupHealthChecking() {
    if (!config.healthCheck.enabled) {
      return;
    }

    // Initial health check
    this.checkDownstreamHealth();

    // Periodic health checks
    setInterval(() => {
      this.checkDownstreamHealth();
    }, config.healthCheck.interval);
  }

  async checkDownstreamHealth() {
    const servers = getAllDownstreamServers();
    
    const healthPromises = servers.map(async (server) => {
      try {
        const healthUrl = `${server.url}${server.healthEndpoint}`;
        const response = await axios.get(healthUrl, {
          timeout: 5000,
        });
        
        this.downstreamHealthStatus.set(server.id, {
          status: 'healthy',
          last_check: new Date().toISOString(),
          response_time: response.headers['x-response-time'] || 'unknown',
        });
        
      } catch (error) {
        this.downstreamHealthStatus.set(server.id, {
          status: 'unhealthy',
          last_check: new Date().toISOString(),
          error: error.message,
        });
      }
    });

    await Promise.all(healthPromises);
  }

  isServerHealthy(serverId) {
    const health = this.downstreamHealthStatus.get(serverId);
    return health && health.status === 'healthy';
  }

  async start() {
    try {
      // Validate configuration
      validateConfig();
      console.log('Configuration validated successfully');

      // Start the server
      const server = this.app.listen(config.server.port, config.server.host, () => {
        console.log(`🚀 MCP Proxy Server started on http://${config.server.host}:${config.server.port}`);
        console.log(`📊 Routing strategy: ${config.routing.strategy}`);
        console.log(`🎯 Downstream servers: ${Object.keys(config.downstreamServers).join(', ')}`);
        console.log(`🔍 Available endpoints:`);
        console.log(`   • Health: http://${config.server.host}:${config.server.port}/health`);
        console.log(`   • Info: http://${config.server.host}:${config.server.port}/info`);
        console.log(`   • Methods: http://${config.server.host}:${config.server.port}/mcp/get_methods`);
        console.log(`   • Proxy: http://${config.server.host}:${config.server.port}/proxy/{target}/*`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.log('Received SIGTERM, shutting down gracefully');
        server.close(() => {
          console.log('Server closed');
          process.exit(0);
        });
      });

      process.on('SIGINT', () => {
        console.log('Received SIGINT, shutting down gracefully');
        server.close(() => {
          console.log('Server closed');
          process.exit(0);
        });
      });

      return server;
      
    } catch (error) {
      console.error('Failed to start MCP Proxy Server:', error.message);
      process.exit(1);
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const proxyServer = new MCPProxyServer();
  proxyServer.start();
}

module.exports = MCPProxyServer; 