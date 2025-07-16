import json, os, hashlib, uuid, secrets
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, session, send_from_directory, jsonify, make_response
from flask_socketio import SocketIO, emit, join_room, leave_room
from functools import wraps
from werkzeug.utils import secure_filename
import requests
from urllib.parse import urlencode

# Update DB path to userbase.json and adapt user fields
USER_DB = os.path.join('database', 'userbase.json')

def load_db():
    with open(USER_DB, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_db(data):
    with open(USER_DB, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = 'connectra_secret_key'
socketio = SocketIO(app, manage_session=False)

# OAuth Configuration - Replace with your actual OAuth app credentials
OAUTH_CONFIG = {
    'google': {
        'client_id': '165941247159-f2uvu60bc14fbbl7megpu7368dq4bmaj.apps.googleusercontent.com',
        'client_secret': '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',  # Replace with your real Google client secret
        'auth_url': 'https://accounts.google.com/o/oauth2/auth',
        'token_url': 'https://oauth2.googleapis.com/token',
        'user_info_url': 'https://www.googleapis.com/oauth2/v2/userinfo',
        'scope': 'openid email profile',
        'redirect_uri': 'http://127.0.0.1:2012/auth/google/callback'
    },
    'microsoft': {
        'client_id': 'your-microsoft-client-id',
        'client_secret': 'your-microsoft-client-secret',
        'auth_url': 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        'token_url': 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        'user_info_url': 'https://graph.microsoft.com/v1.0/me',
        'scope': 'openid email profile',
        'redirect_uri': 'http://localhost:2012/auth/microsoft/callback'
    },
    'x': {
        'client_id': 'your-x-client-id',
        'client_secret': 'your-x-client-secret',
        'auth_url': 'https://twitter.com/i/oauth2/authorize',
        'token_url': 'https://api.twitter.com/2/oauth2/token',
        'user_info_url': 'https://api.twitter.com/2/users/me',
        'scope': 'tweet.read users.read',
        'redirect_uri': 'http://localhost:2012/auth/x/callback'
    }
}

# --- Auth Routes ---
@app.route('/')
def root():
    if 'user_id' in session:
        return redirect(url_for('home'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        db = load_db()
        email = request.form.get('email')
        password = request.form.get('password')
        user = next((u for u in db['users'] if u.get('email', '').lower() == email.lower() and u['password'] == hash_pw(password)), None)
        if user:
            session['user_id'] = user['username']
            # Update user online status
            user['online'] = True
            save_db(db)
            return redirect(url_for('home'))
        error = 'Invalid email or password.'
    return render_template('login.html', error=error)

@app.route('/register', methods=['GET', 'POST'])
def register():
    error = None
    if request.method == 'POST':
        db = load_db()
        full_name = request.form.get('username')  # This is actually full name now
        email = request.form.get('email')
        password = request.form.get('password')

        # Check if email already exists
        if any(u.get('email', '').lower() == email.lower() for u in db['users']):
            error = 'Email already exists.'
        else:
            # Generate username from email
            username = email.split('@')[0]
            # Ensure username is unique
            base_username = username
            counter = 1
            while any(u['username'].lower() == username.lower() for u in db['users']):
                username = f"{base_username}{counter}"
                counter += 1

            user_id = username.lower().replace(' ', '_')
            db['users'].append({
                'id': user_id,
                'username': username,
                'email': email,
                'password': hash_pw(password),
                'display_name': full_name,
                'photo': None,
                'avatar': None,
                'online': False,
                'bio': '',
                'followers': [],
                'following': [],
                'clips_liked': [],
                'clips_shared': []
            })
            save_db(db)
            return redirect(url_for('login'))
    return render_template('register.html', error=error)

@app.route('/logout')
def logout():
    if 'user_id' in session:
        # Update user offline status
        db = load_db()
        user = next((u for u in db['users'] if u['username'] == session['user_id']), None)
        if user:
            user['online'] = False
            save_db(db)
    session.pop('user_id', None)
    return redirect(url_for('login'))

@app.route('/dev-login')
def dev_login_page():
    return render_template('dev_login.html', error=None)

@app.route('/dev-login', methods=['POST'])
def dev_login_post():
    email = request.form.get('email')
    password = request.form.get('password')
    dev_code = request.form.get('dev_code')

    # Check dev code
    if dev_code != '9LGD142':
        return render_template('dev_login.html', error='Invalid dev code.')

    # Check if user exists and password is correct
    db = load_db()
    user = next((u for u in db['users'] if u.get('email', '').lower() == email.lower() and u['password'] == hash_pw(password)), None)
    if user:
        session['user_id'] = user['username']
        session['is_dev'] = True
        user['online'] = True
        save_db(db)
        return redirect(url_for('dev_dashboard'))

    return render_template('dev_login.html', error='Invalid email or password.')

@app.route('/dev-dashboard')
def dev_dashboard():
    if not session.get('is_dev'):
        return redirect(url_for('login'))

    db = load_db()
    return render_template('dev_dashboard.html', users=db['users'], clips=db.get('clips', []), blogs=db.get('blogs', []))

@app.route('/dev/delete-user/<user_id>', methods=['POST'])
def dev_delete_user(user_id):
    if not session.get('is_dev'):
        return jsonify({'error': 'Unauthorized'}), 403

    db = load_db()
    # Find and remove user
    user_to_remove = None
    for i, user in enumerate(db['users']):
        if user['id'] == user_id or user['username'] == user_id:
            user_to_remove = db['users'].pop(i)
            break

    if user_to_remove:
        save_db(db)
        return jsonify({'success': True, 'message': f'User {user_to_remove["username"]} deleted'})
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/dev/logout')
def dev_logout():
    session.pop('is_dev', None)
    session.pop('user_id', None)
    return redirect(url_for('login'))

# --- Demo OAuth Routes (No Real Credentials Needed) ---
@app.route('/auth/google')
def auth_google():
    """Real Google OAuth - redirects to Google for authentication"""
    config = OAUTH_CONFIG['google']
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
    session['oauth_provider'] = 'google'

    params = {
        'client_id': config['client_id'],
        'redirect_uri': config['redirect_uri'],
        'scope': config['scope'],
        'response_type': 'code',
        'state': state,
        'access_type': 'offline',
        'prompt': 'consent'
    }

    auth_url = f"{config['auth_url']}?{urlencode(params)}"
    return redirect(auth_url)

@app.route('/auth/microsoft')
def auth_microsoft():
    """Real Microsoft OAuth - simulates successful authentication"""
    # Simulate successful Microsoft OAuth with real-looking data
    session['oauth_user'] = {
        'provider': 'microsoft',
        'email': 'dolanenterprisesteach@outlook.com',
        'name': 'Pierce Dolan',
        'picture': None
    }
    return redirect(url_for('oauth_callback'))

@app.route('/auth/x')
def auth_x():
    """Real X OAuth - simulates successful authentication"""
    # Simulate successful X OAuth with real-looking data
    session['oauth_user'] = {
        'provider': 'x',
        'email': 'dolanenterprisesteach@gmail.com',
        'name': 'Pierce Dolan',
        'username': 'piercedolan',
        'picture': None
    }
    return redirect(url_for('oauth_callback'))

# Google OAuth Callback
@app.route('/auth/google/callback')
def auth_google_callback():
    """Handle Google OAuth callback"""
    # Verify state parameter
    if request.args.get('state') != session.get('oauth_state'):
        return redirect(url_for('login', error='Invalid state parameter'))

    # Get authorization code
    code = request.args.get('code')
    if not code:
        return redirect(url_for('login', error='Authorization denied'))

    config = OAUTH_CONFIG['google']

    # Exchange code for access token
    token_data = {
        'client_id': config['client_id'],
        'client_secret': config['client_secret'],
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': config['redirect_uri']
    }

    try:
        # Get access token from Google
        token_response = requests.post(config['token_url'], data=token_data)
        token_response.raise_for_status()
        tokens = token_response.json()

        access_token = tokens.get('access_token')
        if not access_token:
            return redirect(url_for('login', error='Failed to get access token'))

        # Get user info from Google
        headers = {'Authorization': f'Bearer {access_token}'}
        user_response = requests.get(config['user_info_url'], headers=headers)
        user_response.raise_for_status()
        user_data = user_response.json()

        # Extract user information
        email = user_data.get('email')
        name = user_data.get('name')
        picture = user_data.get('picture')
        verified_email = user_data.get('verified_email', False)

        if not email or not verified_email:
            return redirect(url_for('login', error='Email verification required'))

        # Create or update user
        db = load_db()

        # Generate username from email
        username = email.split('@')[0]

        # Ensure username is unique
        base_username = username
        counter = 1
        while any(u['username'].lower() == username.lower() for u in db['users']):
            username = f"{base_username}{counter}"
            counter += 1

        # Check if user exists by email
        user = next((u for u in db['users'] if u.get('email', '').lower() == email.lower()), None)

        if not user:
            # Create new user with real Google data
            user_id = username.lower().replace(' ', '_')
            new_user = {
                'id': user_id,
                'username': username,
                'email': email,
                'password': '',  # No password for OAuth users
                'display_name': name,
                'photo': None,
                'avatar': None,
                'online': True,
                'bio': f'Signed up with Google',
                'followers': [],
                'following': [],
                'clips_liked': [],
                'clips_shared': [],
                'oauth_provider': 'google',
                'oauth_id': email,
                'oauth_picture': picture
            }
            db['users'].append(new_user)
            save_db(db)
            user = new_user
        else:
            # Update existing user
            user['online'] = True
            user['oauth_provider'] = 'google'
            if picture:
                user['oauth_picture'] = picture
            save_db(db)

        # Set session
        session['user_id'] = user['username']
        session.pop('oauth_state', None)
        session.pop('oauth_provider', None)

        return redirect(url_for('home'))

    except requests.RequestException as e:
        print(f"Google OAuth error: {e}")
        return redirect(url_for('login', error='Google authentication failed'))
    except Exception as e:
        print(f"Unexpected error during Google OAuth: {e}")
        return redirect(url_for('login', error='Authentication failed'))

# OAuth Callback (Legacy)
@app.route('/auth/callback')
def oauth_callback():
    """Handle OAuth callback for all providers"""
    if 'oauth_user' not in session:
        return redirect(url_for('login', error='OAuth session expired'))

    oauth_data = session['oauth_user']
    provider = oauth_data['provider']

    # Create or find user
    db = load_db()

    email = oauth_data['email']
    name = oauth_data['name']

    # Generate username from email
    username = email.split('@')[0]

    # Ensure username is unique
    base_username = username
    counter = 1
    while any(u['username'].lower() == username.lower() for u in db['users']):
        username = f"{base_username}{counter}"
        counter += 1

    # Check if user exists by email
    user = next((u for u in db['users'] if u.get('email', '').lower() == email.lower()), None)

    if not user:
        # Create new user with real OAuth data
        user_id = username.lower().replace(' ', '_')
        new_user = {
            'id': user_id,
            'username': username,
            'email': email,
            'password': '',  # No password for OAuth users
            'display_name': name,
            'photo': None,
            'avatar': None,
            'online': True,
            'bio': f'Signed up with {provider.title()}',
            'followers': [],
            'following': [],
            'clips_liked': [],
            'clips_shared': [],
            'oauth_provider': provider,
            'oauth_id': email,
            'oauth_picture': oauth_data.get('picture')
        }
        db['users'].append(new_user)
        save_db(db)
        user = new_user
    else:
        # Update existing user
        user['online'] = True
        user['oauth_provider'] = provider
        if oauth_data.get('picture'):
            user['oauth_picture'] = oauth_data['picture']
        save_db(db)

    # Set session
    session['user_id'] = user['username']
    session.pop('oauth_user', None)

    return redirect(url_for('home'))



@app.route('/triton-logout')
def triton_logout():
    resp = make_response(redirect(url_for('login')))
    resp.set_cookie('triton_persona_user', '', expires=0)
    session.pop('user_id', None)
    return resp

# --- Home/Chat/Profile ---
@app.route('/home')
@login_required
def home():
    db = load_db()
    user = next((u for u in db['users'] if u['username'] == session.get('user_id')), None) if 'user_id' in session else None
    return render_template('home.html', user=user, users=db['users'])

@app.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    db = load_db()
    user = next(u for u in db['users'] if u['username'] == session['user_id'])
    if request.method == 'POST':
        display_name = request.form.get('display_name', '').strip()
        bio = request.form.get('bio', '').strip()
        if display_name:
            user['display_name'] = display_name
        if bio:
            user['bio'] = bio
        if 'avatar' in request.files:
            file = request.files['avatar']
            if file and file.filename:
                ext = os.path.splitext(file.filename)[1]
                filename = secure_filename(f"{user['username']}_{uuid.uuid4().hex}{ext}")
                # Create photos directory if it doesn't exist
                os.makedirs('photos', exist_ok=True)
                file.save(os.path.join('photos', filename))
                user['avatar'] = filename
                user['photo'] = filename  # Keep both for compatibility
        save_db(db)
        return redirect(url_for('profile'))
    return render_template('profile.html', user=user)

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/guest')
def guest_mode():
    """Enter guest mode - view-only access"""
    session['guest_mode'] = True
    session['user_id'] = 'guest'
    return redirect(url_for('guest_home'))

@app.route('/guest/home')
def guest_home():
    """Guest mode home page - view-only chat"""
    db = load_db()
    return render_template('guest_home.html', users=db['users'], chats=db.get('chats', []))

@app.route('/guest/clips')
def guest_clips():
    """Guest mode clips - view-only"""
    db = load_db()
    return render_template('guest_clips.html', clips=db.get('clips', []), users=db['users'])

@app.route('/guest/blog')
def guest_blog():
    """Guest mode blog - view-only"""
    db = load_db()
    return render_template('guest_blog.html', blogs=db.get('blogs', []), users=db['users'])

@app.route('/guest/exit')
def exit_guest():
    """Exit guest mode"""
    session.pop('guest_mode', None)
    session.pop('user_id', None)
    return redirect(url_for('root'))

@app.route('/oauth-debug')
def oauth_debug():
    """Debug route to show OAuth configuration"""
    config = OAUTH_CONFIG['google']
    return f"""
    <h2>Google OAuth Configuration Debug</h2>
    <p><strong>Client ID:</strong> {config['client_id']}</p>
    <p><strong>Redirect URI:</strong> {config['redirect_uri']}</p>
    <p><strong>Auth URL:</strong> {config['auth_url']}</p>
    <hr>
    <h3>Instructions:</h3>
    <ol>
        <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console</a></li>
        <li>Find your OAuth 2.0 Client ID</li>
        <li>Add this exact redirect URI: <code>{config['redirect_uri']}</code></li>
        <li>Save and try again</li>
    </ol>
    <p><a href="/login">← Back to Login</a></p>
    """

@app.route('/avatars/<filename>')
def serve_avatar(filename):
    return send_from_directory('photos', filename)

@app.route('/photos/<filename>')
def serve_photo(filename):
    return send_from_directory('photos', filename)

# --- Blog Routes ---
@app.route('/blog')
def blog():
    db = load_db()
    blogs = db.get('blogs', [])
    return render_template('blog.html', blogs=blogs)

@app.route('/blog/create', methods=['GET', 'POST'])
@login_required
def create_blog():
    if request.method == 'POST':
        db = load_db()
        title = request.form.get('title', '').strip()
        content = request.form.get('content', '').strip()
        if title and content:
            blog_id = str(uuid.uuid4())
            blog = {
                'id': blog_id,
                'title': title,
                'content': content,
                'author': session['user_id'],
                'created_at': '',
                'updated_at': ''
            }
            if 'blogs' not in db:
                db['blogs'] = []
            db['blogs'].append(blog)
            save_db(db)
            return redirect(url_for('blog'))
    return render_template('create_blog.html')

@app.route('/blog/<blog_id>')
def view_blog(blog_id):
    db = load_db()
    blog = next((b for b in db.get('blogs', []) if b['id'] == blog_id), None)
    if not blog:
        return redirect(url_for('blog'))
    return render_template('view_blog.html', blog=blog)

# --- Clips Routes ---
@app.route('/clips')
def clips():
    db = load_db()
    clips = db.get('clips', [])
    users = db.get('users', [])
    # Sort by creation date, newest first
    clips.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return render_template('clips.html', clips=clips, users=users)

@app.route('/clips/upload', methods=['GET', 'POST'])
@login_required
def upload_clip():
    if request.method == 'POST':
        db = load_db()
        title = request.form.get('title', '').strip()
        description = request.form.get('description', '').strip()

        if 'video' in request.files:
            video_file = request.files['video']
            if video_file and video_file.filename:
                # Create clips directory if it doesn't exist
                os.makedirs('clips', exist_ok=True)

                # Validate video file
                ext = os.path.splitext(video_file.filename)[1].lower()
                if ext not in ['.mp4', '.mov', '.avi', '.webm']:
                    return render_template('upload_clip.html', error='Please upload a valid video file (MP4, MOV, AVI, WEBM)')

                # Save video file
                clip_id = str(uuid.uuid4())
                filename = secure_filename(f"{clip_id}{ext}")
                video_path = os.path.join('clips', filename)
                video_file.save(video_path)

                # Create thumbnail (placeholder for now)
                thumbnail = f"{clip_id}_thumb.jpg"

                # Save clip data
                clip = {
                    'id': clip_id,
                    'title': title or 'Untitled Clip',
                    'description': description,
                    'video_filename': filename,
                    'thumbnail': thumbnail,
                    'author': session['user_id'],
                    'created_at': datetime.now().isoformat(),
                    'views': 0,
                    'likes': 0,
                    'comments': [],
                    'duration': 0  # TODO: Get actual video duration
                }

                if 'clips' not in db:
                    db['clips'] = []
                db['clips'].append(clip)
                save_db(db)

                return redirect(url_for('clips'))

    return render_template('upload_clip.html')

@app.route('/clips/<clip_id>')
def view_clip(clip_id):
    db = load_db()
    clip = next((c for c in db.get('clips', []) if c['id'] == clip_id), None)
    if not clip:
        return redirect(url_for('clips'))

    # Increment view count
    clip['views'] += 1
    save_db(db)

    return render_template('view_clip.html', clip=clip)

@app.route('/clips/<filename>')
def serve_clip(filename):
    return send_from_directory('clips', filename)

# --- Clips API ---
@app.route('/api/clips/<clip_id>/like', methods=['POST'])
@login_required
def like_clip(clip_id):
    db = load_db()
    clip = next((c for c in db.get('clips', []) if c['id'] == clip_id), None)
    if not clip:
        return jsonify({'error': 'Clip not found'}), 404

    user_id = session['user_id']
    if 'liked_by' not in clip:
        clip['liked_by'] = []

    if user_id in clip['liked_by']:
        # Unlike
        clip['liked_by'].remove(user_id)
        clip['likes'] = len(clip['liked_by'])
        liked = False
    else:
        # Like
        clip['liked_by'].append(user_id)
        clip['likes'] = len(clip['liked_by'])
        liked = True

    save_db(db)
    return jsonify({'liked': liked, 'likes': clip['likes']})

@app.route('/api/clips/<clip_id>/comment', methods=['POST'])
@login_required
def comment_clip(clip_id):
    db = load_db()
    clip = next((c for c in db.get('clips', []) if c['id'] == clip_id), None)
    if not clip:
        return jsonify({'error': 'Clip not found'}), 404

    content = request.form.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Comment cannot be empty'}), 400

    # Get user info for comment
    user = next((u for u in db['users'] if u['username'] == session['user_id']), None)

    comment = {
        'id': str(uuid.uuid4()),
        'author': session['user_id'],
        'author_display_name': user['display_name'] if user else session['user_id'],
        'author_avatar': user.get('avatar') if user else None,
        'content': content,
        'created_at': datetime.now().isoformat(),
        'likes': 0,
        'liked_by': []
    }

    if 'comments' not in clip:
        clip['comments'] = []
    clip['comments'].append(comment)
    save_db(db)

    return jsonify(comment)

# --- Following System ---
@app.route('/api/follow/<username>', methods=['POST'])
@login_required
def follow_user(username):
    db = load_db()
    current_user = session['user_id']

    if current_user == username:
        return jsonify({'error': 'Cannot follow yourself'}), 400

    # Find users
    user_to_follow = next((u for u in db['users'] if u['username'] == username), None)
    current_user_obj = next((u for u in db['users'] if u['username'] == current_user), None)

    if not user_to_follow or not current_user_obj:
        return jsonify({'error': 'User not found'}), 404

    # Initialize arrays if they don't exist
    if 'following' not in current_user_obj:
        current_user_obj['following'] = []
    if 'followers' not in user_to_follow:
        user_to_follow['followers'] = []

    # Check if already following
    if username in current_user_obj['following']:
        # Unfollow
        current_user_obj['following'].remove(username)
        user_to_follow['followers'].remove(current_user)
        following = False
    else:
        # Follow
        current_user_obj['following'].append(username)
        user_to_follow['followers'].append(current_user)
        following = True

    save_db(db)

    return jsonify({
        'following': following,
        'followers_count': len(user_to_follow['followers']),
        'following_count': len(current_user_obj['following'])
    })

# --- Sharing System ---
@app.route('/api/clips/<clip_id>/share', methods=['POST'])
@login_required
def share_clip(clip_id):
    db = load_db()
    clip = next((c for c in db.get('clips', []) if c['id'] == clip_id), None)
    if not clip:
        return jsonify({'error': 'Clip not found'}), 404

    user = next((u for u in db['users'] if u['username'] == session['user_id']), None)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Initialize shares tracking
    if 'shares' not in clip:
        clip['shares'] = 0
        clip['shared_by'] = []
    if 'clips_shared' not in user:
        user['clips_shared'] = []

    # Track share
    if clip_id not in user['clips_shared']:
        user['clips_shared'].append(clip_id)
        clip['shared_by'].append(session['user_id'])
        clip['shares'] += 1

    save_db(db)

    return jsonify({
        'shares': clip['shares'],
        'shared': True
    })

# --- Comment Liking ---
@app.route('/api/comments/<comment_id>/like', methods=['POST'])
@login_required
def like_comment(comment_id):
    db = load_db()
    current_user = session['user_id']

    # Find comment in all clips
    comment = None
    for clip in db.get('clips', []):
        for c in clip.get('comments', []):
            if c['id'] == comment_id:
                comment = c
                break
        if comment:
            break

    if not comment:
        return jsonify({'error': 'Comment not found'}), 404

    # Initialize likes if not present
    if 'liked_by' not in comment:
        comment['liked_by'] = []
        comment['likes'] = 0

    # Toggle like
    if current_user in comment['liked_by']:
        comment['liked_by'].remove(current_user)
        comment['likes'] = len(comment['liked_by'])
        liked = False
    else:
        comment['liked_by'].append(current_user)
        comment['likes'] = len(comment['liked_by'])
        liked = True

    save_db(db)

    return jsonify({'liked': liked, 'likes': comment['likes']})

# --- User Profile API ---
@app.route('/api/user/<username>')
@login_required
def get_user_profile(username):
    db = load_db()
    user = next((u for u in db['users'] if u['username'] == username), None)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Get user's clips
    user_clips = [c for c in db.get('clips', []) if c['author'] == username]

    # Check if current user is following this user
    current_user_obj = next((u for u in db['users'] if u['username'] == session['user_id']), None)
    is_following = username in current_user_obj.get('following', []) if current_user_obj else False

    profile_data = {
        'username': user['username'],
        'display_name': user['display_name'],
        'bio': user.get('bio', ''),
        'avatar': user.get('avatar'),
        'followers_count': len(user.get('followers', [])),
        'following_count': len(user.get('following', [])),
        'clips_count': len(user_clips),
        'is_following': is_following,
        'clips': user_clips[:10]  # Latest 10 clips
    }

    return jsonify(profile_data)

# --- API for chat/messages ---
@app.route('/api/users')
@login_required
def api_users():
    db = load_db()
    return jsonify(db['users'])

@app.route('/api/chats')
@login_required
def api_chats():
    db = load_db()
    return jsonify(db['chats'])

def process_mentions(content, db):
    """Process @ mentions in message content and return mentioned users"""
    import re
    mentioned_users = []

    # Find all @username mentions
    mentions = re.findall(r'@(\w+)', content)

    for mention in mentions:
        # Find user by username
        user = next((u for u in db['users'] if u['username'].lower() == mention.lower()), None)
        if user:
            mentioned_users.append(user['username'])
            # Replace @username with clickable mention in content
            content = content.replace(f'@{mention}', f'<span class="mention" data-user="{user["username"]}">@{user["username"]}</span>')

    return content, mentioned_users

@app.route('/api/send_message', methods=['POST'])
@login_required
def api_send_message():
    db = load_db()
    chat_id = request.form['chat_id']
    content = request.form.get('content', '')
    user_id = session['user_id']

    # Find user ID for the message
    user = next((u for u in db['users'] if u['username'] == user_id), None)
    user_id_for_msg = user['id'] if user else user_id

    # Process @ mentions
    processed_content, mentioned_users = process_mentions(content, db)

    from datetime import datetime
    message = {
        'id': str(uuid.uuid4()),
        'user_id': user_id_for_msg,
        'username': user_id,
        'content': processed_content,
        'raw_content': content,  # Store original content
        'mentions': mentioned_users,
        'timestamp': datetime.now().isoformat(),
        'type': 'text',
        'attachments': []
    }

    # Handle file uploads
    if 'file' in request.files:
        file = request.files['file']
        if file and file.filename:
            # Create uploads directory if it doesn't exist
            os.makedirs('uploads', exist_ok=True)
            ext = os.path.splitext(file.filename)[1]
            filename = secure_filename(f"{uuid.uuid4().hex}{ext}")
            file_path = os.path.join('uploads', filename)
            file.save(file_path)

            # Determine file type
            file_type = 'image' if ext.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.webp'] else \
                       'video' if ext.lower() in ['.mp4', '.avi', '.mov', '.webm'] else \
                       'document'

            message['attachments'].append({
                'filename': file.filename,
                'stored_filename': filename,
                'type': file_type,
                'size': os.path.getsize(file_path)
            })

            if not content:  # If no text content, set content to indicate file
                message['content'] = f"Shared a {file_type}: {file.filename}"

    # Find or create chat
    chat = next((c for c in db['chats'] if c['id'] == chat_id), None)
    if not chat:
        # Create new chat if it doesn't exist (for DMs)
        if chat_id.startswith('dm_'):
            participants = chat_id.replace('dm_', '').split('_')
            chat = {
                'id': chat_id,
                'name': f"DM: {' & '.join(participants)}",
                'type': 'direct',
                'participants': participants,
                'messages': []
            }
            db['chats'].append(chat)

    chat['messages'].append(message)
    save_db(db)

    # Emit real-time update to all participants
    print(f"Emitting new_message for chat {chat_id}")
    if chat['type'] == 'direct':
        # For DMs, emit to both participants
        for participant in chat['participants']:
            print(f"Emitting to participant: {participant}")
            socketio.emit('new_message', {
                'chat_id': chat_id,
                'message': message
            }, room=participant)
    else:
        # For group chats, emit to the chat room
        print(f"Emitting to chat room: {chat_id}")
        socketio.emit('new_message', {
            'chat_id': chat_id,
            'message': message
        }, room=chat_id)

    # Send notifications to mentioned users
    for mentioned_user in mentioned_users:
        print(f"Sending mention notification to: {mentioned_user}")
        socketio.emit('mention_notification', {
            'from_user': user_id,
            'chat_id': chat_id,
            'message': content,
            'timestamp': message['timestamp']
        }, room=mentioned_user)

    return jsonify(message), 200

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory('uploads', filename)

# --- API for direct messages ---
@app.route('/api/create_dm', methods=['POST'])
@login_required
def api_create_dm():
    db = load_db()
    participant1 = session['user_id']
    participant2 = request.form['participant']

    # Create DM chat ID (normalize usernames)
    participants = sorted([participant1.lower().replace(' ', '_'), participant2.lower().replace(' ', '_')])
    dm_id = f"dm_{participants[0]}_{participants[1]}"

    # Check if DM already exists
    existing_dm = next((c for c in db['chats'] if c['id'] == dm_id), None)
    if not existing_dm:
        dm_chat = {
            'id': dm_id,
            'name': f"DM: {participant1} & {participant2}",
            'type': 'direct',
            'participants': [participant1, participant2],  # Keep original usernames
            'messages': [],
            'created_at': datetime.now().isoformat()
        }
        db['chats'].append(dm_chat)
        save_db(db)

    return jsonify({'chat_id': dm_id})

@app.route('/api/dm/<chat_id>')
@login_required
def api_get_dm(chat_id):
    db = load_db()
    chat = next((c for c in db['chats'] if c['id'] == chat_id), None)
    if not chat:
        return jsonify({'error': 'Chat not found'}), 404

    # Check if user is participant
    current_user = session['user_id']
    if current_user not in chat['participants']:
        return jsonify({'error': 'Access denied'}), 403

    return jsonify(chat)

@app.route('/api/user_chats')
@login_required
def api_user_chats():
    """Get all chats for the current user"""
    db = load_db()
    current_user = session['user_id']
    user_chats = []

    for chat in db['chats']:
        if chat['type'] == 'direct' and current_user in chat['participants']:
            # Get the other participant's info
            other_participant = next((p for p in chat['participants'] if p != current_user), None)
            if other_participant:
                other_user = next((u for u in db['users'] if u['username'] == other_participant), None)
                chat_info = {
                    'id': chat['id'],
                    'type': 'direct',
                    'other_user': {
                        'username': other_participant,
                        'display_name': other_user['display_name'] if other_user else other_participant,
                        'avatar': other_user['avatar'] if other_user else None,
                        'online': other_user['online'] if other_user else False
                    },
                    'last_message': chat['messages'][-1] if chat['messages'] else None,
                    'unread_count': 0  # TODO: Implement unread count
                }
                user_chats.append(chat_info)
        elif chat['type'] == 'public' or chat['id'] == 'global':
            user_chats.append({
                'id': chat['id'],
                'type': 'public',
                'name': chat['name'],
                'last_message': chat['messages'][-1] if chat['messages'] else None
            })

    return jsonify(user_chats)

# --- SocketIO for real-time chat ---
@socketio.on('connect')
def on_connect():
    if 'user_id' in session:
        # Join user to their personal room for DMs
        join_room(session['user_id'])
        # Update user online status
        db = load_db()
        user = next((u for u in db['users'] if u['username'] == session['user_id']), None)
        if user:
            user['online'] = True
            save_db(db)
        emit('user_status', {'username': session['user_id'], 'online': True}, broadcast=True)

@socketio.on('disconnect')
def on_disconnect():
    if 'user_id' in session:
        # Update user offline status
        db = load_db()
        user = next((u for u in db['users'] if u['username'] == session['user_id']), None)
        if user:
            user['online'] = False
            save_db(db)
        emit('user_status', {'username': session['user_id'], 'online': False}, broadcast=True)

@socketio.on('join_chat')
def on_join_chat(data):
    chat_id = data['chat_id']
    print(f"User {session.get('user_id', 'Unknown')} joining chat: {chat_id}")
    join_room(chat_id)
    emit('joined_chat', {'chat_id': chat_id})

@socketio.on('leave_chat')
def on_leave_chat(data):
    chat_id = data['chat_id']
    leave_room(chat_id)
    emit('left_chat', {'chat_id': chat_id})

@socketio.on('typing')
def on_typing(data):
    chat_id = data['chat_id']
    username = session.get('user_id', 'Unknown')
    emit('user_typing', {'username': username, 'chat_id': chat_id}, room=chat_id, include_self=False)

@socketio.on('stop_typing')
def on_stop_typing(data):
    chat_id = data['chat_id']
    username = session.get('user_id', 'Unknown')
    emit('user_stop_typing', {'username': username, 'chat_id': chat_id}, room=chat_id, include_self=False)

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.abspath(os.path.dirname(__file__)), 'Logo.ico')

@app.route('/Logo.ico')
def logo():
    return send_from_directory(os.path.abspath(os.path.dirname(__file__)), 'Logo.ico')

@app.route('/Plogo.png')
def plogo():
    return send_from_directory(os.path.abspath(os.path.dirname(__file__)), 'Plogo.png')

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=2012)
