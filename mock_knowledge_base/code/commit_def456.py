# Implementation for NEX-456: MCP server for Task API
class MCPServer:
    def __init__(self, task_api):
        self.task_api = task_api
    
    def invoke_method(self, method_name, params):
        if method_name == 'create_task':
            return self.task_api.create_task(params)
        # MCP protocol logic example:
        if method_name == "search":
            return {"result": f"Searching for {params}"}
        elif method_name == "get_ticket":
            return {"result": f"Fetching ticket {params}"}
        else:
            return {"error": "Method not supported"}