/**
 * MCP Proxy Server Configuration
 * 
 * This file defines the routing configuration for the MCP proxy server,
 * mapping route prefixes to downstream MCP server endpoints.
 */

const config = {
  // Server configuration
  server: {
    port: process.env.PROXY_PORT || 8000,
    host: process.env.PROXY_HOST || 'localhost',
    timeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000, // 30 seconds
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
  },

  // Downstream MCP server mappings
  // Format: 'route_prefix': { url: 'server_url', description: 'server_description' }
  downstreamServers: {
    'github': {
      url: process.env.GITHUB_MCP_URL || 'http://localhost:8004',
      description: 'GitHub MCP Server - Repository and issue management',
      healthEndpoint: '/health',
      timeout: 15000,
    },
    'filesystem': {
      url: process.env.FILESYSTEM_MCP_URL || 'http://localhost:8001',
      description: 'Filesystem MCP Server - File system operations',
      healthEndpoint: '/health',
      timeout: 10000,
    },
    'gdrive': {
      url: process.env.GDRIVE_MCP_URL || 'http://localhost:8005',
      description: 'Google Drive MCP Server - Google Drive integration',
      healthEndpoint: '/health',
      timeout: 20000,
    },
  },

  // Routing configuration
  routing: {
    // Default routing strategy: 'prefix' or 'header'
    strategy: process.env.ROUTING_STRATEGY || 'prefix',
    
    // For prefix-based routing: /proxy/{prefix}/mcp/...
    prefixBasePath: '/proxy',
    
    // For header-based routing
    targetHeader: 'X-Target-MCP',
    
    // Default server if no routing info provided
    defaultServer: process.env.DEFAULT_MCP_SERVER || null,
  },

  // Health check configuration
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000, // 1 minute
    retryAttempts: parseInt(process.env.HEALTH_RETRY_ATTEMPTS) || 3,
  },

  // CORS configuration
  cors: {
    enabled: process.env.CORS_ENABLED !== 'false',
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Target-MCP'],
  },
};

// Validation function
function validateConfig() {
  const errors = [];

  // Validate server configuration
  if (!config.server.port || config.server.port < 1 || config.server.port > 65535) {
    errors.push('Invalid server port');
  }

  // Validate downstream servers
  if (!config.downstreamServers || Object.keys(config.downstreamServers).length === 0) {
    errors.push('No downstream servers configured');
  }

  // Validate each downstream server
  Object.entries(config.downstreamServers).forEach(([key, server]) => {
    if (!server.url) {
      errors.push(`Missing URL for downstream server: ${key}`);
    }
    if (!server.url.startsWith('http://') && !server.url.startsWith('https://')) {
      errors.push(`Invalid URL format for downstream server: ${key}`);
    }
  });

  // Validate routing strategy
  if (!['prefix', 'header'].includes(config.routing.strategy)) {
    errors.push('Invalid routing strategy. Must be "prefix" or "header"');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return true;
}

// Helper functions
function getDownstreamServer(identifier) {
  return config.downstreamServers[identifier] || null;
}

function getAllDownstreamServers() {
  return Object.entries(config.downstreamServers).map(([key, server]) => ({
    id: key,
    ...server,
  }));
}

function getServerInfo() {
  return {
    name: 'MCP Proxy Server',
    version: '1.0.0',
    routing_strategy: config.routing.strategy,
    downstream_servers: Object.keys(config.downstreamServers),
    endpoints: {
      health: '/health',
      proxy_prefix: config.routing.prefixBasePath,
      methods_aggregation: '/mcp/get_methods',
    },
  };
}

module.exports = {
  config,
  validateConfig,
  getDownstreamServer,
  getAllDownstreamServers,
  getServerInfo,
}; 