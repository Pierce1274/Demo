// Connectra Clips JavaScript
let currentVideoIndex = 0;
let videos = [];
let isPlaying = false;

// Initialize clips
document.addEventListener('DOMContentLoaded', function() {
    videos = document.querySelectorAll('.clip-video');
    setupIntersectionObserver();
    setupKeyboardControls();
    
    // Auto-play first video
    if (videos.length > 0) {
        playVideo(0);
    }
});

// Setup intersection observer for auto-play
function setupIntersectionObserver() {
    const options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                // Play video when in view
                video.play();
                updatePlayPauseButton(video, true);
                currentVideoIndex = Array.from(videos).indexOf(video);
            } else {
                // Pause video when out of view
                video.pause();
                updatePlayPauseButton(video, false);
            }
        });
    }, options);

    videos.forEach(video => {
        observer.observe(video);
    });
}

// Setup keyboard controls
function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case ' ':
                e.preventDefault();
                toggleCurrentVideo();
                break;
            case 'ArrowUp':
                e.preventDefault();
                scrollToVideo(currentVideoIndex - 1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                scrollToVideo(currentVideoIndex + 1);
                break;
        }
    });
}

// Play specific video
function playVideo(index) {
    if (index >= 0 && index < videos.length) {
        videos.forEach((video, i) => {
            if (i === index) {
                video.play();
                updatePlayPauseButton(video, true);
            } else {
                video.pause();
                updatePlayPauseButton(video, false);
            }
        });
        currentVideoIndex = index;
    }
}

// Toggle play/pause for current video
function toggleCurrentVideo() {
    if (currentVideoIndex >= 0 && currentVideoIndex < videos.length) {
        const video = videos[currentVideoIndex];
        togglePlayPause(video.parentElement.querySelector('.play-pause-btn'));
    }
}

// Toggle play/pause
function togglePlayPause(button) {
    const videoContainer = button.parentElement;
    const video = videoContainer.querySelector('.clip-video');
    const icon = button.querySelector('i');
    
    if (video.paused) {
        video.play();
        icon.className = 'fas fa-pause';
        isPlaying = true;
    } else {
        video.pause();
        icon.className = 'fas fa-play';
        isPlaying = false;
    }
}

// Update play/pause button
function updatePlayPauseButton(video, playing) {
    const container = video.parentElement;
    const button = container.querySelector('.play-pause-btn');
    const icon = button.querySelector('i');
    
    if (playing) {
        icon.className = 'fas fa-pause';
    } else {
        icon.className = 'fas fa-play';
    }
}

// Scroll to specific video
function scrollToVideo(index) {
    if (index >= 0 && index < videos.length) {
        const clipItem = videos[index].closest('.clip-item');
        clipItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Like/unlike clip
async function toggleLike(clipId) {
    try {
        const response = await fetch(`/api/clips/${clipId}/like`, {
            method: 'POST'
        });
        
        if (response.ok) {
            const data = await response.json();
            const likeBtn = document.querySelector(`[data-clip-id="${clipId}"] .like-btn`);
            const likeCount = likeBtn.querySelector('.like-count');
            
            if (data.liked) {
                likeBtn.classList.add('liked');
                likeBtn.querySelector('i').className = 'fas fa-heart';
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.querySelector('i').className = 'far fa-heart';
            }
            
            likeCount.textContent = data.likes;
            
            // Add heart animation
            createHeartAnimation(likeBtn);
        }
    } catch (error) {
        console.error('Error toggling like:', error);
    }
}

// Create heart animation
function createHeartAnimation(button) {
    const heart = document.createElement('div');
    heart.innerHTML = '<i class="fas fa-heart"></i>';
    heart.style.cssText = `
        position: absolute;
        color: #ff4757;
        font-size: 2rem;
        pointer-events: none;
        animation: heartFloat 1s ease-out forwards;
        z-index: 1000;
    `;
    
    button.appendChild(heart);
    
    setTimeout(() => {
        heart.remove();
    }, 1000);
}

// Toggle comments
function toggleComments(clipId) {
    const commentsSection = document.getElementById(`comments-${clipId}`);
    if (commentsSection.style.display === 'none') {
        commentsSection.style.display = 'block';
        commentsSection.scrollIntoView({ behavior: 'smooth' });
    } else {
        commentsSection.style.display = 'none';
    }
}

// Add comment
async function addComment(clipId) {
    const input = document.getElementById(`comment-input-${clipId}`);
    const content = input.value.trim();
    
    if (!content) return;
    
    try {
        const response = await fetch(`/api/clips/${clipId}/comment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                content: content
            })
        });
        
        if (response.ok) {
            const comment = await response.json();
            addCommentToUI(clipId, comment);
            input.value = '';
            
            // Update comment count
            const commentBtn = document.querySelector(`[data-clip-id="${clipId}"] .comment-btn span`);
            const currentCount = parseInt(commentBtn.textContent) || 0;
            commentBtn.textContent = currentCount + 1;
        }
    } catch (error) {
        console.error('Error adding comment:', error);
    }
}

// Add comment to UI
function addCommentToUI(clipId, comment) {
    const commentsList = document.querySelector(`#comments-${clipId} .comments-list`);
    const commentElement = document.createElement('div');
    commentElement.className = 'comment';
    commentElement.innerHTML = `
        <div class="comment-author">@${comment.author}</div>
        <div class="comment-content">${comment.content}</div>
        <div class="comment-time">Just now</div>
    `;
    commentsList.appendChild(commentElement);
}

// Share clip
async function shareClip(clipId) {
    try {
        // Track share on server
        const response = await fetch(`/api/clips/${clipId}/share`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            // Update share count in UI
            const shareBtn = document.querySelector(`[data-clip-id="${clipId}"] .share-btn .share-count`);
            if (shareBtn) {
                shareBtn.textContent = data.shares;
            }
        }

        // Share functionality
        const url = `${window.location.origin}/clips/${clipId}`;

        if (navigator.share) {
            navigator.share({
                title: 'Check out this Connectra Clip!',
                url: url
            });
        } else {
            navigator.clipboard.writeText(url).then(() => {
                showToast('Link copied to clipboard!');
            });
        }
    } catch (error) {
        console.error('Error sharing clip:', error);
    }
}

// Follow/Unfollow user
async function toggleFollow(username, event) {
    event.stopPropagation(); // Prevent triggering profile view

    try {
        const response = await fetch(`/api/follow/${username}`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            const followBtn = document.querySelector(`[data-username="${username}"] .follow-btn`);

            if (data.following) {
                followBtn.innerHTML = '<i class="fas fa-check"></i> Following';
                followBtn.classList.add('following');
                showToast(`Now following @${username}!`);
            } else {
                followBtn.innerHTML = '<i class="fas fa-plus"></i> Follow';
                followBtn.classList.remove('following');
                showToast(`Unfollowed @${username}`);
            }

            // Add follow animation
            createFollowAnimation(followBtn);
        }
    } catch (error) {
        console.error('Error toggling follow:', error);
    }
}

// View user profile
function viewProfile(username) {
    // TODO: Implement user profile modal or page
    showToast(`Viewing @${username}'s profile`);
    console.log('View profile for:', username);
}

// Toggle bookmark
async function toggleBookmark(clipId) {
    // TODO: Implement bookmark functionality
    const bookmarkBtn = document.querySelector(`[data-clip-id="${clipId}"] .bookmark-btn`);

    if (bookmarkBtn.classList.contains('bookmarked')) {
        bookmarkBtn.classList.remove('bookmarked');
        bookmarkBtn.querySelector('i').className = 'far fa-bookmark';
        showToast('Removed from bookmarks');
    } else {
        bookmarkBtn.classList.add('bookmarked');
        bookmarkBtn.querySelector('i').className = 'fas fa-bookmark';
        showToast('Added to bookmarks');
    }
}

// Like/unlike comment
async function toggleCommentLike(commentId) {
    try {
        const response = await fetch(`/api/comments/${commentId}/like`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            const likeBtn = document.querySelector(`[data-comment-id="${commentId}"] .comment-like-btn`);
            const likeCount = likeBtn.querySelector('.comment-like-count');

            if (data.liked) {
                likeBtn.classList.add('liked');
                likeBtn.querySelector('i').className = 'fas fa-heart';
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.querySelector('i').className = 'far fa-heart';
            }

            likeCount.textContent = data.likes;
        }
    } catch (error) {
        console.error('Error toggling comment like:', error);
    }
}

// Create follow animation
function createFollowAnimation(button) {
    const sparkle = document.createElement('div');
    sparkle.innerHTML = '<i class="fas fa-sparkles"></i>';
    sparkle.style.cssText = `
        position: absolute;
        color: var(--orange);
        font-size: 1.5rem;
        pointer-events: none;
        animation: sparkleFloat 1s ease-out forwards;
        z-index: 1000;
    `;

    button.appendChild(sparkle);

    setTimeout(() => {
        sparkle.remove();
    }, 1000);
}

// Show clip options
function showClipOptions(clipId) {
    const options = [
        { icon: 'fas fa-flag', text: 'Report', action: () => reportClip(clipId) },
        { icon: 'fas fa-download', text: 'Download', action: () => downloadClip(clipId) },
        { icon: 'fas fa-link', text: 'Copy Link', action: () => copyClipLink(clipId) },
        { icon: 'fas fa-user-slash', text: 'Not Interested', action: () => hideClip(clipId) }
    ];

    // TODO: Implement options menu
    console.log('Show options for clip:', clipId, options);
}

// Report clip
function reportClip(clipId) {
    showToast('Clip reported. Thank you for keeping Connectra safe!');
}

// Download clip
function downloadClip(clipId) {
    showToast('Download started...');
    // TODO: Implement download functionality
}

// Copy clip link
function copyClipLink(clipId) {
    const url = `${window.location.origin}/clips/${clipId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard!');
    });
}

// Hide clip
function hideClip(clipId) {
    const clipElement = document.querySelector(`[data-clip-id="${clipId}"]`);
    if (clipElement) {
        clipElement.style.display = 'none';
        showToast('Clip hidden from your feed');
    }
}

// Show toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 1rem 2rem;
        border-radius: 25px;
        z-index: 1000;
        animation: fadeInOut 3s ease-in-out forwards;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes heartFloat {
        0% {
            transform: translateY(0) scale(1);
            opacity: 1;
        }
        100% {
            transform: translateY(-50px) scale(1.5);
            opacity: 0;
        }
    }
    
    @keyframes fadeInOut {
        0%, 100% { opacity: 0; }
        10%, 90% { opacity: 1; }
    }

    @keyframes sparkleFloat {
        0% {
            transform: translateY(0) scale(1);
            opacity: 1;
        }
        100% {
            transform: translateY(-30px) scale(1.5);
            opacity: 0;
        }
    }
    
    .comments-section {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(0, 0, 0, 0.9);
        max-height: 50%;
        overflow-y: auto;
        padding: 1rem;
        border-radius: 12px 12px 0 0;
    }
    
    .comments-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #333;
    }
    
    .close-comments {
        background: none;
        border: none;
        color: white;
        font-size: 1.2rem;
        cursor: pointer;
    }
    
    .comment {
        margin-bottom: 1rem;
        padding: 0.5rem;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
    }
    
    .comment-author {
        font-weight: bold;
        color: var(--orange);
        margin-bottom: 0.3rem;
    }
    
    .comment-content {
        margin-bottom: 0.3rem;
    }
    
    .comment-time {
        font-size: 0.8rem;
        opacity: 0.7;
    }
    
    .comment-form {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid #333;
    }
    
    .comment-form input {
        flex: 1;
        padding: 0.8rem;
        border: none;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        outline: none;
    }
    
    .comment-form input::placeholder {
        color: rgba(255, 255, 255, 0.5);
    }
    
    .comment-form button {
        background: var(--orange);
        border: none;
        color: white;
        padding: 0.8rem 1rem;
        border-radius: 50%;
        cursor: pointer;
    }
`;
document.head.appendChild(style);
