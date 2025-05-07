// Main JavaScript for Fluxion Gaming Portal

// Global variables
let gamesData = {};
let activeFilters = new Set();
let socket = null;
let searchQuery = '';
let toast = null;

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize toast notification
    toast = new bootstrap.Toast(document.getElementById('notification-toast'));
    
    // Initialize Socket.IO connection
    initSocketConnection();
    
    // Fetch and display games
    fetchGames();
    
    // Setup event listeners
    setupEventListeners();
});

// Initialize Socket.IO connection
function initSocketConnection() {
    console.log('Initializing Socket.IO connection...');
    
    // Connect to the server
    socket = io();
    
    // Connection established
    socket.on('connect', function() {
        console.log('Socket.IO connection established');
        // Only fetch games data on first connection, not on reconnects
        if (!gamesData.games || Object.keys(gamesData.games).length === 0) {
            fetchGames();
        }
    });
    
    // Handle connection error
    socket.on('connect_error', function(error) {
        console.error('Socket.IO connection error:', error);
        showToast('Connection Error', 'Could not connect to server. Retrying...', 'error');
    });
    
    // Update online users count
    socket.on('user_count', function(data) {
        const usersElement = document.getElementById('online-users-count');
        // Add animation when the count changes
        if (usersElement.textContent !== data.count.toString()) {
            usersElement.classList.add('animate__animated', 'animate__heartBeat');
            setTimeout(() => {
                usersElement.classList.remove('animate__animated', 'animate__heartBeat');
            }, 1000);
        }
        usersElement.textContent = data.count;
    });
    
    // Handle game updates
    socket.on('game_update', function(data) {
        updateGameStats(data.game, data.action, data.data);
        
        // Show notification for updates from other users
        if (!isUserInitiatedAction(data.game, data.action)) {
            const actionMessage = getActionMessage(data.action, data.game);
            showToast('Game Update', actionMessage, 'info');
        }
    });
}

// Check if the action was initiated by the current user
function isUserInitiatedAction(gameName, action) {
    // For plays, we don't show notifications as they could be too frequent
    if (action === 'play') return true;
    
    // For likes and favorites, check local storage
    const key = `fluxion_${action}_${gameName}`;
    return localStorage.getItem(key) === 'true';
}

// Get a friendly message for an action
function getActionMessage(action, gameName) {
    switch(action) {
        case 'like':
            return `Someone just liked "${gameName}"`;
        case 'favorite':
            return `Someone added "${gameName}" to their favorites`;
        case 'play':
            return `Someone is playing "${gameName}"`;
        default:
            return `"${gameName}" was updated`;
    }
}

// Show toast notification
function showToast(title, message, type = 'success') {
    const toastEl = document.getElementById('notification-toast');
    const titleEl = document.getElementById('toast-title');
    const messageEl = document.getElementById('toast-message');
    const timeEl = document.getElementById('toast-time');
    
    // Set content
    titleEl.textContent = title;
    messageEl.textContent = message;
    timeEl.textContent = 'Just now';
    
    // Set style based on type
    toastEl.className = 'toast';
    if (type === 'error') {
        toastEl.classList.add('bg-danger', 'text-white');
    } else if (type === 'info') {
        toastEl.classList.add('bg-info', 'text-white');
    } else if (type === 'success') {
        toastEl.classList.add('bg-success', 'text-white');
    }
    
    // Show the toast
    toast.show();
}

// Track if a fetch is in progress to prevent duplicate requests
let fetchInProgress = false;

// Fetch games data from the server
function fetchGames() {
    // Prevent multiple simultaneous fetch requests
    if (fetchInProgress) {
        console.log('Fetch already in progress, skipping');
        return;
    }
    
    console.log('Fetching games data...');
    fetchInProgress = true;
    
    // Show loading animation only if we don't already have games data
    if (!gamesData.games || Object.keys(gamesData.games).length === 0) {
        const loadingTemplate = document.getElementById('loading-animation-template');
        document.getElementById('games-grid').innerHTML = loadingTemplate.innerHTML;
    }
    
    // Add cache buster to prevent browser caching
    const cacheBuster = new Date().getTime();
    
    fetch(`/api/games?_=${cacheBuster}`, {
        headers: {
            'Cache-Control': 'no-cache'
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            gamesData = data;
            renderGames();
            extractAndRenderTags();
            fetchInProgress = false;
        })
        .catch(error => {
            console.error('Error fetching games:', error);
            // Only show error if we don't already have games data
            if (!gamesData.games || Object.keys(gamesData.games).length === 0) {
                document.getElementById('games-grid').innerHTML = `
                    <div class="col-12 text-center py-5">
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-triangle me-2"></i> 
                            Failed to load games. Please refresh the page or try again later.
                        </div>
                    </div>
                `;
            }
            fetchInProgress = false;
        });
}

// Render games to the grid
function renderGames() {
    console.log('Rendering games...');
    
    const gamesGrid = document.getElementById('games-grid');
    const template = document.getElementById('game-card-template');
    
    // Clear the grid
    gamesGrid.innerHTML = '';
    
    // Check if there are games
    if (!gamesData.games || Object.keys(gamesData.games).length === 0) {
        gamesGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i> 
                    No games available at the moment.
                </div>
            </div>
        `;
        return;
    }
    
    // Filter games based on active filters and search query
    const filteredGames = Object.entries(gamesData.games).filter(([name, game]) => {
        // Check if the game matches the search query
        const matchesSearch = searchQuery === '' || 
            name.toLowerCase().includes(searchQuery.toLowerCase());
        
        // Check if the game has all the active filter tags
        const matchesFilters = activeFilters.size === 0 || 
            [...activeFilters].every(tag => game.Tags.includes(tag));
        
        return matchesSearch && matchesFilters;
    });
    
    // If no games match the filters
    if (filteredGames.length === 0) {
        gamesGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="alert alert-info">
                    <i class="fas fa-filter me-2"></i> 
                    No games match your current filters. Try adjusting your search or filters.
                </div>
            </div>
        `;
        return;
    }
    
    // Render each game with a staggered animation delay
    filteredGames.forEach(([name, game], index) => {
        // Clone the template
        const gameCard = template.content.cloneNode(true);
        
        // Add staggered animation delay
        const cardWrapper = gameCard.querySelector('.game-card-wrapper');
        cardWrapper.style.animationDelay = `${index * 0.05}s`;
        
        // Set game data
        const thumbnail = gameCard.querySelector('.game-thumbnail');
        thumbnail.src = game.Thumbnail;
        thumbnail.alt = name;
        
        gameCard.querySelector('.game-title').textContent = name;
        gameCard.querySelector('.plays-count').textContent = game.Plays;
        gameCard.querySelector('.likes-count').textContent = game.Likes;
        gameCard.querySelector('.favorites-count').textContent = game.Favorites;
        
        // Add tags
        const tagsContainer = gameCard.querySelector('.game-tags');
        tagsContainer.innerHTML = '';
        
        game.Tags.forEach(tag => {
            const tagBadge = document.createElement('span');
            tagBadge.className = 'badge game-tag bg-secondary me-1 mb-1';
            tagBadge.textContent = tag;
            tagBadge.addEventListener('click', () => toggleTagFilter(tag));
            tagsContainer.appendChild(tagBadge);
        });
        
        // Setup buttons
        const playBtn = gameCard.querySelector('.play-btn');
        const overlayPlayBtn = gameCard.querySelector('.play-overlay-btn');
        
        // Both play buttons do the same action
        playBtn.addEventListener('click', () => loadGame(name, game.Location));
        overlayPlayBtn.addEventListener('click', () => loadGame(name, game.Location));
        
        const likeBtn = gameCard.querySelector('.like-btn');
        const favoriteBtn = gameCard.querySelector('.favorite-btn');
        
        // Check if user has liked or favorited before
        if (hasUserInteracted(name, 'like')) {
            likeBtn.classList.add('active');
        }
        
        if (hasUserInteracted(name, 'favorite')) {
            favoriteBtn.classList.add('active');
        }
        
        // Add event listeners for like and favorite
        likeBtn.addEventListener('click', () => handleGameAction(name, 'like', likeBtn));
        favoriteBtn.addEventListener('click', () => handleGameAction(name, 'favorite', favoriteBtn));
        
        // Add the card to the grid
        gamesGrid.appendChild(gameCard);
    });
}

// Extract unique tags and render tag filters
function extractAndRenderTags() {
    console.log('Extracting and rendering tags...');
    
    const allTags = new Set();
    
    // Extract all unique tags
    Object.values(gamesData.games).forEach(game => {
        game.Tags.forEach(tag => allTags.add(tag));
    });
    
    // Sort tags alphabetically
    const sortedTags = [...allTags].sort();
    
    // Render tag filters
    const tagFiltersContainer = document.getElementById('tag-filters');
    tagFiltersContainer.innerHTML = '';
    
    sortedTags.forEach(tag => {
        const tagBadge = document.createElement('span');
        tagBadge.className = `badge tag-filter ${activeFilters.has(tag) ? 'bg-primary active' : 'bg-secondary'}`;
        tagBadge.textContent = tag;
        tagBadge.addEventListener('click', () => toggleTagFilter(tag));
        tagFiltersContainer.appendChild(tagBadge);
    });
}

// Toggle tag filter
function toggleTagFilter(tag) {
    console.log(`Toggling tag filter: ${tag}`);
    
    if (activeFilters.has(tag)) {
        activeFilters.delete(tag);
    } else {
        activeFilters.add(tag);
    }
    
    // Update active class on tag filters
    document.querySelectorAll('.tag-filter').forEach(el => {
        if (el.textContent === tag) {
            el.classList.toggle('active', activeFilters.has(tag));
            
            // Toggle color class
            el.classList.toggle('bg-secondary', !activeFilters.has(tag));
            el.classList.toggle('bg-primary', activeFilters.has(tag));
        }
    });
    
    // Re-render games with the updated filters
    renderGames();
}

// Load game in iframe
function loadGame(gameName, gameLocation) {
    console.log(`Loading game: ${gameName} from ${gameLocation}`);
    
    // Show game container
    const gameContainer = document.getElementById('game-container');
    gameContainer.style.display = 'block';
    
    // Set current game title and store current game info for refresh functionality
    document.getElementById('current-game-title').textContent = gameName;
    gameContainer.dataset.gameName = gameName;
    gameContainer.dataset.gameLocation = gameLocation;
    
    // Create new iframe (safer approach)
    createGameIframe(gameLocation);
    
    // Scroll to game container
    gameContainer.scrollIntoView({ behavior: 'smooth' });
    
    // Increment play count
    handleGameAction(gameName, 'play');
    
    // Show toast notification
    showToast('Game Loaded', `Now playing: ${gameName}`, 'success');
}

// Create a new iframe for game content
function createGameIframe(gameLocation) {
    // Get container and clear existing content
    const gameFrameContainer = document.getElementById('game-frame-container');
    gameFrameContainer.innerHTML = '';
    
    // Create a new iframe element
    const iframe = document.createElement('iframe');
    iframe.src = `/games/${gameLocation}`;
    iframe.id = 'game-iframe';
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('loading', 'lazy');
    iframe.allowFullscreen;
    
    // Add iframe to container
    gameFrameContainer.appendChild(iframe);
    
    return iframe;
}

// Refresh the current game by recreating the iframe
function refreshGame() {
    const gameContainer = document.getElementById('game-container');
    const gameLocation = gameContainer.dataset.gameLocation;
    
    if (gameLocation) {
        // Show loading animation
        const gameFrameContainer = document.getElementById('game-frame-container');
        gameFrameContainer.innerHTML = '<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
        
        // Short timeout to show loading animation
        setTimeout(() => {
            createGameIframe(gameLocation);
            showToast('Game Refreshed', 'The game has been refreshed', 'success');
        }, 300);
    }
}

// Toggle fullscreen mode for the game
function toggleFullscreen() {
    const iframe = document.getElementById('game-iframe');
    if (!iframe) return;

    if (!document.fullscreenElement) {
        // Go fullscreen
        if (iframe.requestFullscreen) {
            iframe.requestFullscreen();
        } else if (iframe.mozRequestFullScreen) { // Firefox
            iframe.mozRequestFullScreen();
        } else if (iframe.webkitRequestFullscreen) { // Chrome, Safari & Opera
            iframe.webkitRequestFullscreen();
        } else if (iframe.msRequestFullscreen) { // IE/Edge
            iframe.msRequestFullscreen();
        }

        // Update button icon
        const fullscreenBtn = document.getElementById('fullscreen-game-btn');
        fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        fullscreenBtn.title = 'Exit Fullscreen';
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) { // Firefox
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) { // Chrome, Safari & Opera
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { // IE/Edge
            document.msExitFullscreen();
        }

        // Update button icon
        const fullscreenBtn = document.getElementById('fullscreen-game-btn');
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fullscreenBtn.title = 'Fullscreen';
    }
}

// Handle game actions (play, like, favorite)
function handleGameAction(gameName, action, buttonElement = null) {
    console.log(`Handling game action: ${action} for ${gameName}`);
    
    // For like and favorite, check if user has already interacted
    if ((action === 'like' || action === 'favorite') && hasUserInteracted(gameName, action)) {
        console.log(`User already ${action}d this game`);
        showToast('Action Not Allowed', `You have already ${action}d this game`, 'info');
        return;
    }
    
    // Send action to server via Socket.IO
    socket.emit('game_action', {
        game: gameName,
        action: action
    });
    
    // For like and favorite, mark as interacted and update button
    if (action === 'like' || action === 'favorite') {
        markUserInteraction(gameName, action);
        
        if (buttonElement) {
            buttonElement.classList.add('active', 'btn-action-success');
            // Remove animation class after it completes
            setTimeout(() => {
                buttonElement.classList.remove('btn-action-success');
            }, 300);
        }
        
        // Show success toast
        const actionText = action === 'like' ? 'liked' : 'added to favorites';
        showToast('Success', `You have ${actionText} ${gameName}!`, 'success');
    }
}

// Update game stats in the UI
function updateGameStats(gameName, action, gameData) {
    console.log(`Updating stats for ${gameName} after ${action} action`);
    
    // Find all instances of this game in the UI
    const cards = document.querySelectorAll('.game-card');
    
    cards.forEach(card => {
        const title = card.querySelector('.game-title');
        
        if (title && title.textContent === gameName) {
            // Get the relevant count elements
            const playsElement = card.querySelector('.plays-count');
            const likesElement = card.querySelector('.likes-count');
            const favoritesElement = card.querySelector('.favorites-count');
            
            // Update counts with animation
            if (action === 'play' && playsElement.textContent !== gameData.Plays.toString()) {
                animateCountChange(playsElement, gameData.Plays);
            }
            
            if (action === 'like' && likesElement.textContent !== gameData.Likes.toString()) {
                animateCountChange(likesElement, gameData.Likes);
            }
            
            if (action === 'favorite' && favoritesElement.textContent !== gameData.Favorites.toString()) {
                animateCountChange(favoritesElement, gameData.Favorites);
            }
        }
    });
    
    // Update gamesData object
    if (gamesData.games && gamesData.games[gameName]) {
        gamesData.games[gameName] = gameData;
    }
}

// Animate count change with a pop effect
function animateCountChange(element, newValue) {
    element.classList.add('animate__animated', 'animate__heartBeat');
    element.textContent = newValue;
    
    setTimeout(() => {
        element.classList.remove('animate__animated', 'animate__heartBeat');
    }, 1000);
}

// Check if user has already interacted with a game
function hasUserInteracted(gameName, action) {
    const key = `fluxion_${action}_${gameName}`;
    return localStorage.getItem(key) === 'true';
}

// Mark user interaction with a game
function markUserInteraction(gameName, action) {
    const key = `fluxion_${action}_${gameName}`;
    localStorage.setItem(key, 'true');
}

// Setup event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Game control buttons
    document.getElementById('close-game-btn').addEventListener('click', () => {
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('game-frame-container').innerHTML = '';
    });
    
    document.getElementById('refresh-game-btn').addEventListener('click', refreshGame);
    document.getElementById('fullscreen-game-btn').addEventListener('click', toggleFullscreen);
    
    // Handle fullscreen change event to update button icon
    document.addEventListener('fullscreenchange', () => {
        const fullscreenBtn = document.getElementById('fullscreen-game-btn');
        if (document.fullscreenElement) {
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
            fullscreenBtn.title = 'Exit Fullscreen';
        } else {
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            fullscreenBtn.title = 'Fullscreen';
        }
    });
    
    // Search input
    const searchInput = document.getElementById('search-input');
    
    // Handle input with a small debounce
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            searchQuery = searchInput.value.trim();
            renderGames();
        }, 300);
    });
    
    // Handle search button click
    const searchButton = searchInput.nextElementSibling;
    searchButton.addEventListener('click', () => {
        searchQuery = searchInput.value.trim();
        renderGames();
    });
    
    // Handle Enter key press in search input
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchQuery = searchInput.value.trim();
            renderGames();
        }
    });
}

setupEventListeners();
