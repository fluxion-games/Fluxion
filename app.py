import os
import json
import logging
import threading
from flask import Flask, render_template, jsonify, request, session, send_from_directory
from flask_socketio import SocketIO, emit

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "fluxion_secret_key")

@app.errorhandler(404)
def page_not_found(e):
    return render_template('maintenance.html'), 404

@app.errorhandler(500)
def server_error(e):
    return render_template('maintenance.html'), 500

# Direct route to serve files from the games folder
@app.route('/games/<path:filename>')
def serve_game_file(filename):
    """Serve files directly from the games folder"""
    return send_from_directory('games', filename)

# Initialize SocketIO with a simpler configuration
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables
connected_users = 0
games_data = {}
active_players = {}  # Track {session_id: {machine_id: str, game: str}}
user_profiles = {}  # Track {machine_id: {likes: [], favorites: [], played: []}}
machine_counter = 0  # Counter for generating unique machine IDs

# Lock for thread-safe operations on the games data
data_lock = threading.Lock()

def load_games_data():
    """Load games data from JSON file"""
    try:
        with open('games/games.json', 'r') as f:
            data = json.load(f)
            return data
    except FileNotFoundError:
        logger.error("games.json file not found")
        # Create a default structure if the file doesn't exist
        return {"games": {}}
    except json.JSONDecodeError:
        logger.error("Error decoding games.json")
        return {"games": {}}

def save_games_data():
    """Save games data to JSON file"""
    try:
        with open('games/games.json', 'w') as f:
            json.dump(games_data, f, indent=2)
        logger.debug("Games data saved successfully")
        return True
    except Exception as e:
        logger.error(f"Error saving games data: {e}")
        return False

# Load games data on startup
games_data = load_games_data()

@app.route('/')
def index():
    """Render the main index page"""
    return render_template('index.html')

@app.route('/active-players')
def active_players_page():
    """Show currently active players"""
    return render_template('active_players.html', players=active_players)

@app.route('/profile/<machine_id>')
def user_profile(machine_id):
    """Show user profile for given machine ID"""
    profile = user_profiles.get(machine_id, {'likes': [], 'favorites': [], 'played': []})
    return render_template('profile.html', machine_id=machine_id, profile=profile, games=games_data['games'])

@app.route('/test')
def test_route():
    """Simple test route to verify server is working"""
    return jsonify({"status": "ok", "message": "Server is running!"})

@app.route('/api/games', methods=['GET'])
def get_games():
    """API endpoint to get all games"""
    global games_data
    
    with data_lock:
        games_data = load_games_data()
        return jsonify(games_data)

@app.route('/api/games/update', methods=['POST'])
def update_game():
    """API endpoint to update game stats"""
    data = request.json
    game_name = data.get('game')
    action = data.get('action')
    
    if not game_name or not action:
        return jsonify({"error": "Invalid request - missing game or action"}), 400
    
    with data_lock:
        # Reload data to ensure we have the latest
        global games_data
        games_data = load_games_data()
        
        # Validate game exists
        if game_name not in games_data['games']:
            return jsonify({"error": f"Invalid game name: {game_name}"}), 400
        
        # Process action
        if action == 'play':
            games_data['games'][game_name]['Plays'] += 1
        elif action == 'like':
            games_data['games'][game_name]['Likes'] += 1
        elif action == 'favorite':
            games_data['games'][game_name]['Favorites'] += 1
        else:
            return jsonify({"error": f"Invalid action: {action}"}), 400
        
        # Save updated data
        success = save_games_data()
        
        if not success:
            return jsonify({"error": "Failed to save game data"}), 500
        
        try:
            # Emit update to all clients
            socketio.emit('game_update', {
                'game': game_name,
                'action': action,
                'data': games_data['games'][game_name]
            })
        except Exception as e:
            logger.error(f"Error emitting Socket.IO event: {e}")
    
    return jsonify({"success": True, "message": f"Updated {action} for {game_name}"})

# Socket.IO event handlers
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    global connected_users, machine_counter
    try:
        with data_lock:
            connected_users += 1
            machine_counter += 1
            machine_id = f"machine_{machine_counter}"
            session['machine_id'] = machine_id
            emit('user_count', {'count': connected_users}, broadcast=True)
            logger.debug(f"Client connected. Machine ID: {machine_id}, Total users: {connected_users}")
    except Exception as e:
        logger.error(f"Error in handle_connect: {e}")

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    global connected_users
    try:
        with data_lock:
            connected_users = max(0, connected_users - 1)  # Ensure we don't go negative
            if request.sid in active_players:
                del active_players[request.sid]
            emit('user_count', {'count': connected_users}, broadcast=True)
            logger.debug(f"Client disconnected. Total users: {connected_users}")
    except Exception as e:
        logger.error(f"Error in handle_disconnect: {e}")

@socketio.on('game_action')
def handle_game_action(data):
    """Handle game actions (play, like, favorite)"""
    try:
        game_name = data.get('game')
        action = data.get('action')
        
        if action == 'play':
            active_players[request.sid] = {
                'machine_id': session.get('machine_id', 'unknown'),
                'game': game_name
            }
        
        if not game_name or not action:
            logger.warning(f"Invalid game action: {data}")
            return
        
        with data_lock:
            # Reload data to ensure we have the latest
            global games_data
            games_data = load_games_data()
            
            # Validate game exists
            if game_name not in games_data['games']:
                logger.warning(f"Game not found: {game_name}")
                return
            
            # Process action and update user profile
            machine_id = session.get('machine_id', 'unknown')
            if machine_id not in user_profiles:
                user_profiles[machine_id] = {'likes': [], 'favorites': [], 'played': []}

            if action == 'play':
                games_data['games'][game_name]['Plays'] += 1
                if game_name not in user_profiles[machine_id]['played']:
                    user_profiles[machine_id]['played'].append(game_name)
            elif action == 'like':
                games_data['games'][game_name]['Likes'] += 1
                if game_name not in user_profiles[machine_id]['likes']:
                    user_profiles[machine_id]['likes'].append(game_name)
            elif action == 'favorite':
                games_data['games'][game_name]['Favorites'] += 1
                if game_name not in user_profiles[machine_id]['favorites']:
                    user_profiles[machine_id]['favorites'].append(game_name)
            else:
                logger.warning(f"Invalid action: {action}")
                return
            
            # Save updated data
            success = save_games_data()
            
            if not success:
                logger.error(f"Failed to save games data after {action} for {game_name}")
                return
            
            logger.debug(f"Game action processed in JSON: {action} for {game_name}")
            
            # Emit update to all clients
            emit('game_update', {
                'game': game_name,
                'action': action,
                'data': games_data['games'][game_name]
            }, broadcast=True)
    except Exception as e:
        logger.error(f"Error in handle_game_action: {e}")

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
