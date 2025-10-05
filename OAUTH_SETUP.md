# OAuth Setup Guide for Connectra

To enable real OAuth authentication with Google, Microsoft, and X (Twitter), you need to create OAuth applications with each provider and update the credentials in `main.py`.

## 🔑 Google OAuth Setup

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create a new project** or select existing one
3. **Enable Google+ API** and **Google OAuth2 API**
4. **Go to Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
5. **Application type**: Web application
6. **Authorized redirect URIs**: `http://localhost:2012/auth/google/callback`
7. **Copy Client ID and Client Secret**

**Update in main.py:**
```python
'google': {
    'client_id': 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    'client_secret': 'YOUR_GOOGLE_CLIENT_SECRET',
    # ... rest stays the same
}
```

## 🔑 Microsoft OAuth Setup

1. **Go to Azure Portal**: https://portal.azure.com/
2. **Azure Active Directory** → **App registrations** → **New registration**
3. **Name**: Connectra
4. **Redirect URI**: Web → `http://localhost:2012/auth/microsoft/callback`
5. **Register** and copy **Application (client) ID**
6. **Certificates & secrets** → **New client secret** → Copy the secret value

**Update in main.py:**
```python
'microsoft': {
    'client_id': 'YOUR_MICROSOFT_CLIENT_ID',
    'client_secret': 'YOUR_MICROSOFT_CLIENT_SECRET',
    # ... rest stays the same
}
```

## 🔑 X (Twitter) OAuth Setup

1. **Go to Twitter Developer Portal**: https://developer.twitter.com/
2. **Create a new App** in your developer account
3. **App permissions**: Read
4. **Callback URL**: `http://localhost:2012/auth/x/callback`
5. **Copy Client ID and Client Secret** from OAuth 2.0 settings

**Update in main.py:**
```python
'x': {
    'client_id': 'YOUR_X_CLIENT_ID',
    'client_secret': 'YOUR_X_CLIENT_SECRET',
    # ... rest stays the same
}
```

## 🚀 Quick Test Setup (Demo Mode)

For immediate testing, you can use these demo credentials that will show the OAuth flow but won't actually authenticate:

```python
# Demo credentials - replace with real ones for production
OAUTH_CONFIG = {
    'google': {
        'client_id': 'demo-google-client-id',
        'client_secret': 'demo-google-secret',
        # ... rest of config
    },
    # ... other providers
}
```

## 🔧 Production Deployment

When deploying to production:

1. **Update redirect URIs** to your domain:
   - `https://yourdomain.com/auth/google/callback`
   - `https://yourdomain.com/auth/microsoft/callback`
   - `https://yourdomain.com/auth/x/callback`

2. **Use environment variables** for secrets:
```python
import os
OAUTH_CONFIG = {
    'google': {
        'client_id': os.getenv('GOOGLE_CLIENT_ID'),
        'client_secret': os.getenv('GOOGLE_CLIENT_SECRET'),
        # ...
    }
}
```

3. **Enable HTTPS** for all OAuth providers

## ✅ Testing OAuth

1. **Start Connectra**: `python main.py`
2. **Go to**: http://localhost:2012
3. **Click OAuth buttons** - they will redirect to real provider login pages
4. **Sign in with your accounts** - users will be created automatically
5. **Check database** - OAuth users will have provider info

## 🛡️ Security Notes

- **Never commit OAuth secrets** to version control
- **Use HTTPS in production**
- **Validate all OAuth responses**
- **Implement proper error handling**
- **Consider OAuth token refresh** for long-term access

## 📱 Mobile App Support

For mobile apps, you'll need to:
1. **Register mobile redirect URIs** (custom schemes)
2. **Use PKCE** for additional security
3. **Handle deep links** for OAuth callbacks

---

**Need Help?** Check the provider documentation:
- [Google OAuth Guide](https://developers.google.com/identity/protocols/oauth2)
- [Microsoft OAuth Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [X OAuth Guide](https://developer.twitter.com/en/docs/authentication/oauth-2-0)
