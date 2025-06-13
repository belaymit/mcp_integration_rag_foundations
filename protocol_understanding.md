# Protocols Understanding

## MCP invoke_method Flow
- The agent (client) sends an `invoke_method` request to an MCP server, specifying the method name and parameters, which the server validates and executes to interact with the underlying tool/API.
- The MCP server processes the request by calling the corresponding method and returns the result or error in a standardized response format, ensuring consistent agent-to-tool communication.

## MCP vs. A2A Use Cases
- **MCP**: Focuses on standardizing access to external tools and APIs for agents, solving the need for custom code by providing a universal adapter for agent-to-tool interactions, such as an agent using the Filesystem MCP to manage files.
- **A2A**: Enables secure and standardized communication between agents for collaboration and orchestration, addressing the lack of a common protocol for agent-to-agent interactions, like one agent delegating tasks to another using JSON-RPC and SSE for asynchronous events.



## Target MCP Servers Summary
- **GitHub MCP**: Exposes GitHub API actions for managing issues, repositories, and users via MCP methods, allowing agents to interact with GitHub resources.
- **Filesystem MCP**: Provides operations for local file management, such as listing, reading, and writing files, through MCP interfaces.
- **Google Drive MCP**: Offers access to Google Drive files and folders using MCP methods for storage and document handling.
- **Atlassian MCP**: Wraps JIRA and Confluence APIs to enable ticket and documentation management via MCP, facilitating project tracking and collaboration.