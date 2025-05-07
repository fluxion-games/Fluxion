import os
import importlib.util
from flask import Flask, Blueprint
from app import app as main_app, socketio

def load_sub_server(name):
    """Load a sub-server from the servers directory"""
    # Check for Python server
    py_server_path = os.path.join('servers', name, 'main.py')
    if os.path.exists(py_server_path):
        # Load the module dynamically
        spec = importlib.util.spec_from_file_location(f"server_{name}", py_server_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # Get the Flask app from the module
        if hasattr(module, 'app'):
            # Create a blueprint from the sub-app
            bp = Blueprint(name, __name__, url_prefix=f'/other/{name}')
            
            # Register the sub-app's routes to the blueprint
            for rule in module.app.url_map.iter_rules():
                endpoint = module.app.view_functions[rule.endpoint]
                bp.add_url_rule(str(rule), rule.endpoint, endpoint)
                
            return bp

    # Check for Node.js server
    node_server_path = os.path.join('servers', name, 'server.js')
    if os.path.exists(node_server_path):
        # For Node.js servers, we'll create a proxy route
        bp = Blueprint(name, __name__, url_prefix=f'/other/{name}')
        
        # Add a catch-all route that proxies to the Node.js server
        @bp.route('/', defaults={'path': ''})
        @bp.route('/<path:path>')
        def proxy(path):
            from urllib.parse import urljoin
            import requests
            
            node_port = 3000  # Default Node.js port
            try:
                with open(os.path.join('servers', name, 'port.txt'), 'r') as f:
                    node_port = int(f.read().strip())
            except:
                pass
                
            url = f'http://localhost:{node_port}/{path}'
            resp = requests.get(url)
            return resp.content, resp.status_code, resp.headers.items()
            
        return bp
        
    return None

def init_sub_servers():
    """Initialize all sub-servers from the servers directory"""
    if not os.path.exists('servers'):
        os.makedirs('servers')
        
    for name in os.listdir('servers'):
        if os.path.isdir(os.path.join('servers', name)):
            bp = load_sub_server(name)
            if bp:
                main_app.register_blueprint(bp)

# Initialize sub-servers
init_sub_servers()

if __name__ == '__main__':
    socketio.run(main_app, host='0.0.0.0', port=5000, debug=True)
