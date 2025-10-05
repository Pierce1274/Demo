#!/usr/bin/env python3
"""
WSGI Entry Point for Connectra Chat Application

This module provides the WSGI application object for deployment servers
like Gunicorn, uWSGI, or Apache mod_wsgi. It properly handles both the
Flask application and SocketIO real-time functionality.

Usage:
    # For Gunicorn with SocketIO support
    gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:2012 wsgi:application
    
    # For standard WSGI servers (without SocketIO)
    gunicorn --bind 0.0.0.0:2012 wsgi:app
    
    # For development
    python wsgi.py
"""

import os
import sys
import logging
from pathlib import Path

# Add the current directory to Python path to ensure imports work
current_dir = Path(__file__).parent.absolute()
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

# Configure logging for production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('connectra.log') if os.path.exists('.') else logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

try:
    # Import the Flask app and SocketIO instance from main.py
    from main import app, socketio
    
    logger.info("Successfully imported Flask app and SocketIO from main.py")
    
    # The WSGI application object for SocketIO-enabled deployment
    # This is what Gunicorn with eventlet worker should use
    application = socketio
    
    # Alternative WSGI application object for standard Flask deployment
    # This is for servers that don't support SocketIO
    flask_app = app
    
    # For backwards compatibility and standard WSGI servers
    # Some deployment platforms expect 'application' to be the WSGI callable
    if not hasattr(application, '__call__'):
        application = app
    
    logger.info("WSGI application objects configured successfully")
    
except ImportError as e:
    logger.error(f"Failed to import Flask app from main.py: {e}")
    logger.error("Make sure main.py exists and contains 'app' and 'socketio' objects")
    
    # Create a minimal error application for debugging
    from flask import Flask, jsonify
    
    error_app = Flask(__name__)
    
    @error_app.route('/')
    def error_handler():
        return jsonify({
            'error': 'Application import failed',
            'message': str(e),
            'status': 'error'
        }), 500
    
    @error_app.route('/health')
    def health_check():
        return jsonify({
            'status': 'error',
            'message': 'Application not properly configured'
        }), 500
    
    application = error_app
    flask_app = error_app
    
except Exception as e:
    logger.error(f"Unexpected error during WSGI setup: {e}")
    raise

def create_app():
    """
    Application factory function for deployment platforms that expect it.
    Returns the configured Flask application with SocketIO.
    """
    try:
        from main import app, socketio
        
        # Configure app for production if not already configured
        if not app.config.get('SECRET_KEY'):
            app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'connectra_secret_key')
        
        # Set production configurations
        app.config['ENV'] = os.environ.get('FLASK_ENV', 'production')
        app.config['DEBUG'] = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
        
        # Database path configuration
        if not os.path.exists('database'):
            os.makedirs('database', exist_ok=True)
            logger.info("Created database directory")
        
        # Upload directories
        upload_dirs = ['uploads', 'uploads/avatars', 'uploads/blog_files', 'uploads/chat_files', 'photos', 'clips']
        for upload_dir in upload_dirs:
            if not os.path.exists(upload_dir):
                os.makedirs(upload_dir, exist_ok=True)
                logger.info(f"Created upload directory: {upload_dir}")
        
        logger.info("Application factory completed successfully")
        return socketio
        
    except Exception as e:
        logger.error(f"Error in application factory: {e}")
        raise

def get_wsgi_application():
    """
    Get the appropriate WSGI application based on environment.
    This function can be used by deployment scripts.
    """
    env = os.environ.get('WSGI_TYPE', 'socketio').lower()
    
    if env == 'flask':
        logger.info("Using Flask-only WSGI application")
        return flask_app
    else:
        logger.info("Using SocketIO WSGI application")
        return application

# Health check endpoint for load balancers
def health_check_app():
    """Simple health check application for monitoring"""
    from flask import Flask, jsonify
    
    health_app = Flask(__name__)
    
    @health_app.route('/health')
    def health():
        return jsonify({
            'status': 'healthy',
            'service': 'connectra-chat',
            'version': '1.0.0'
        })
    
    return health_app

# Environment-specific configurations
def configure_for_production():
    """Apply production-specific configurations"""
    try:
        # Set secure session configuration
        if hasattr(app, 'config'):
            app.config.update({
                'SESSION_COOKIE_SECURE': os.environ.get('SESSION_COOKIE_SECURE', 'False').lower() == 'true',
                'SESSION_COOKIE_HTTPONLY': True,
                'SESSION_COOKIE_SAMESITE': 'Lax',
                'PERMANENT_SESSION_LIFETIME': 86400,  # 24 hours
            })
        
        # Configure SocketIO for production
        if hasattr(socketio, 'init_app'):
            socketio_config = {
                'cors_allowed_origins': os.environ.get('CORS_ORIGINS', '*').split(','),
                'async_mode': 'eventlet',
                'logger': True,
                'engineio_logger': False
            }
            logger.info("Applied production SocketIO configuration")
        
    except Exception as e:
        logger.warning(f"Could not apply all production configurations: {e}")

# Apply production configurations if not in development
if os.environ.get('FLASK_ENV') != 'development':
    configure_for_production()

# For direct execution (development mode)
if __name__ == '__main__':
    logger.info("Starting Connectra in development mode")
    
    try:
        # Use the SocketIO development server
        port = int(os.environ.get('PORT', 2012))
        host = os.environ.get('HOST', '0.0.0.0')
        debug = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
        
        logger.info(f"Starting development server on {host}:{port}")
        socketio.run(app, host=host, port=port, debug=debug)
        
    except Exception as e:
        logger.error(f"Failed to start development server: {e}")
        sys.exit(1)
