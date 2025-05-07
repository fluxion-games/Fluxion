import json
import os
from app import app, db, Game, Tag, game_tags
from flask import Flask

def migrate_games_from_json():
    """Migrate games data from JSON file to database"""
    # Create database tables
    with app.app_context():
        db.create_all()
        
        # Check if the database already has games
        if Game.query.count() > 0:
            print("Database already contains games. Skipping migration.")
            return
        
        try:
            # Load games from JSON file
            with open('games/games.json', 'r') as f:
                games_data = json.load(f)
                
            if 'games' not in games_data:
                print("Invalid JSON structure. 'games' key not found.")
                return
                
            # Get or create tags
            tag_objects = {}
            all_tags = set()
            
            # First collect all unique tags
            for game_name, game_data in games_data['games'].items():
                if 'Tags' in game_data:
                    for tag in game_data['Tags']:
                        all_tags.add(tag)
            
            # Create tags in database
            for tag_name in all_tags:
                tag = Tag.query.filter_by(name=tag_name).first()
                if not tag:
                    tag = Tag(name=tag_name)
                    db.session.add(tag)
                tag_objects[tag_name] = tag
            
            # Commit the tags first
            db.session.commit()
            
            # Create games
            for game_name, game_data in games_data['games'].items():
                game = Game.query.filter_by(name=game_name).first()
                
                if not game:
                    game = Game(
                        name=game_name,
                        location=game_data.get('Location', ''),
                        thumbnail=game_data.get('Thumbnail', ''),
                        likes=game_data.get('Likes', 0),
                        favorites=game_data.get('Favorites', 0),
                        plays=game_data.get('Plays', 0)
                    )
                    
                    # Add tags to game
                    for tag_name in game_data.get('Tags', []):
                        if tag_name in tag_objects:
                            game.tags.append(tag_objects[tag_name])
                    
                    db.session.add(game)
            
            # Commit all games
            db.session.commit()
            print(f"Successfully migrated {len(games_data['games'])} games to the database.")
            
        except Exception as e:
            db.session.rollback()
            print(f"Error migrating games: {e}")
            raise e

if __name__ == '__main__':
    migrate_games_from_json()