// BeatBox - Core Application Controller

// 1. STATE MANAGEMENT
let audioPlayer;
let currentTrack = null;
let isPlaying = false;
let playQueue = [];
let originalQueue = []; // To restore original order when turning off shuffle
let playHistory = [];
let historyIndex = -1;

// Playback settings
let isShuffle = false;
let repeatMode = 0; // 0 = off, 1 = repeat all, 2 = repeat track
let volumeValue = 0.7;
let isMuted = false;

// Library & Playlists (persistent in localStorage)
let likedTrackIds = [];
let customPlaylists = [];

// Navigation History for headers (Back / Forward)
let viewHistory = [];
let viewHistoryPointer = -1;
let currentView = 'home';
let currentPlaylistId = null;

// Context Menu Tracking
let contextMenuTargetTrackId = null;
let contextMenuTargetPlaylistId = null; // If in playlist view

// Fullscreen visualizer animation frame
let visualizerAnimationFrame = null;
let simulatedFrequencies = [];

// 2. BOOTSTRAP INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  audioPlayer = document.getElementById("audio-element");
  
  // Set initial volume
  audioPlayer.volume = volumeValue;
  
  // Load database from localStorage
  loadFromLocalStorage();
  
  // Initialize UI components
  setupEventListeners();
  updateTimeGreeting();
  renderSidebarPlaylists();
  
  // Navigate to initial view (Home)
  navigateView('home');
  
  // Render quick grid and categories on Home View
  renderHomeView();
  renderGenresGrid();
  
  // Sync liked tracks counts
  updateLikedSongsCount();
  
  // Setup simulated frequency array for visualizer
  for (let i = 0; i < 40; i++) {
    simulatedFrequencies.push(0);
  }
});

// 3. EVENT LISTENERS SETUP
function setupEventListeners() {
  // Audio Element Event Listeners
  audioPlayer.addEventListener("timeupdate", handleTimeUpdate);
  audioPlayer.addEventListener("ended", handleTrackEnded);
  
  audioPlayer.addEventListener("play", () => {
    isPlaying = true;
    updatePlayPauseUI();
    startVisualizer();
  });
  
  audioPlayer.addEventListener("pause", () => {
    isPlaying = false;
    updatePlayPauseUI();
    stopVisualizer();
  });
  
  audioPlayer.addEventListener("volumechange", () => {
    volumeValue = audioPlayer.volume;
    isMuted = audioPlayer.muted;
    updateVolumeUI();
  });

  // Slider event listener for volume hover
  const volumeSlider = document.getElementById("volume-slider");
  volumeSlider.addEventListener("input", (e) => {
    changeVolume(e.target.value);
  });

  // Timeline slider
  const progressSlider = document.getElementById("progress-slider");
  progressSlider.addEventListener("input", (e) => {
    seekAudio(e.target.value);
  });

  // Navigation History Buttons
  document.getElementById("history-back").addEventListener("click", navigateBack);
  document.getElementById("history-forward").addEventListener("click", navigateForward);

  // Search input events
  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      clearSearchBtn.style.display = "block";
      performSearch(query);
    } else {
      clearSearchBtn.style.display = "none";
      document.getElementById("search-results-section").style.display = "none";
      document.getElementById("genres-section").style.display = "block";
    }
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    document.getElementById("search-results-section").style.display = "none";
    document.getElementById("genres-section").style.display = "block";
    searchInput.focus();
  });

  // Library Page Search / Filter
  const libFilterInput = document.getElementById("library-filter-input");
  libFilterInput.addEventListener("input", (e) => {
    renderLibraryView(e.target.value.trim());
  });

  // Document Clicks: Close custom menus/modals on background clicks
  document.addEventListener("click", (e) => {
    const contextMenu = document.getElementById("custom-context-menu");
    if (!contextMenu.contains(e.target)) {
      contextMenu.style.display = "none";
    }
  });

  // Close context menu on scroll
  document.getElementById("content-scroll-container").addEventListener("scroll", () => {
    document.getElementById("custom-context-menu").style.display = "none";
  });

  // Modal Input Enter Key
  document.getElementById("playlist-name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submitCreatePlaylist();
    }
  });
}

// 4. PERSISTENT STORAGE SYNC
function loadFromLocalStorage() {
  try {
    const liked = localStorage.getItem("beatbox_liked_songs");
    likedTrackIds = liked ? JSON.parse(liked) : [];
    
    // Sync liked tracks inside songs list
    songs.forEach(song => {
      song.liked = likedTrackIds.includes(song.id);
    });

    const playlists = localStorage.getItem("beatbox_playlists");
    customPlaylists = playlists ? JSON.parse(playlists) : [];
  } catch (error) {
    console.error("Local storage load failed:", error);
    likedTrackIds = [];
    customPlaylists = [];
  }
}

function saveToLocalStorage() {
  try {
    localStorage.setItem("beatbox_liked_songs", JSON.stringify(likedTrackIds));
    localStorage.setItem("beatbox_playlists", JSON.stringify(customPlaylists));
  } catch (error) {
    console.error("Local storage save failed:", error);
  }
}

// 5. VIEW NAVIGATION CONTROLLER
function navigateView(view, playlistId = null, skipHistoryLog = false) {
  currentView = view;
  currentPlaylistId = playlistId;

  // Toggle visible sections in main layout
  document.querySelectorAll(".content-view").forEach(v => {
    v.style.display = "none";
  });

  const activeSection = document.getElementById(`${view}-view`);
  if (activeSection) {
    activeSection.style.display = "block";
  }

  // Update active sidebar nav
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.remove("active");
  });
  
  if (view === 'home' || view === 'search' || view === 'library') {
    document.getElementById(`nav-${view}`).classList.add("active");
  }

  // Show/Hide search bar in header
  const searchBar = document.getElementById("header-search-bar");
  if (view === 'search') {
    searchBar.style.display = "block";
    document.getElementById("search-input").focus();
  } else {
    searchBar.style.display = "none";
  }

  // Refresh data based on view
  if (view === 'library') {
    renderLibraryView();
  } else if (view === 'liked') {
    renderLikedSongsView();
  } else if (view === 'playlist') {
    renderPlaylistView(playlistId);
  }

  // Log in view history (for back/forward buttons)
  if (!skipHistoryLog) {
    // Truncate future history if navigated from a middle state
    if (viewHistoryPointer < viewHistory.length - 1) {
      viewHistory = viewHistory.slice(0, viewHistoryPointer + 1);
    }
    
    viewHistory.push({ view, playlistId });
    viewHistoryPointer = viewHistory.length - 1;
  }

  updateHistoryArrows();
}

function switchView(viewName, playlistId = null) {
  navigateView(viewName, playlistId);
}

function updateHistoryArrows() {
  const backBtn = document.getElementById("history-back");
  const forwardBtn = document.getElementById("history-forward");

  if (viewHistoryPointer > 0) {
    backBtn.classList.add("active");
    backBtn.removeAttribute("disabled");
    backBtn.style.cursor = "pointer";
  } else {
    backBtn.classList.remove("active");
    backBtn.setAttribute("disabled", "true");
    backBtn.style.cursor = "not-allowed";
  }

  if (viewHistoryPointer < viewHistory.length - 1) {
    forwardBtn.classList.add("active");
    forwardBtn.removeAttribute("disabled");
    forwardBtn.style.cursor = "pointer";
  } else {
    forwardBtn.classList.remove("active");
    forwardBtn.setAttribute("disabled", "true");
    forwardBtn.style.cursor = "not-allowed";
  }
}

function navigateBack() {
  if (viewHistoryPointer > 0) {
    viewHistoryPointer--;
    const state = viewHistory[viewHistoryPointer];
    navigateView(state.view, state.playlistId, true);
  }
}

function navigateForward() {
  if (viewHistoryPointer < viewHistory.length - 1) {
    viewHistoryPointer++;
    const state = viewHistory[viewHistoryPointer];
    navigateView(state.view, state.playlistId, true);
  }
}

// Greeting generator
function updateTimeGreeting() {
  const hours = new Date().getHours();
  let greeting = "Good Day";
  if (hours >= 5 && hours < 12) {
    greeting = "Good Morning";
  } else if (hours >= 12 && hours < 17) {
    greeting = "Good Afternoon";
  } else if (hours >= 17 && hours < 22) {
    greeting = "Good Evening";
  } else {
    greeting = "Good Night";
  }
  document.getElementById("time-greeting").textContent = greeting;
}

// 6. AUDIO PLAYBACK CORE LOGIC

// Main play handler
function playTrack(track, contextTracks = []) {
  if (!track) return;
  
  // Set current playing track
  currentTrack = track;
  
  // Load track source in audio
  audioPlayer.src = track.url;
  
  // If a specific list context is provided, align our queue
  if (contextTracks.length > 0) {
    originalQueue = [...contextTracks];
    if (isShuffle) {
      // Build a shuffled queue but make sure current track is first
      const remaining = contextTracks.filter(t => t.id !== track.id);
      playQueue = [track, ...shuffleArray(remaining)];
    } else {
      // Find track index and copy full list
      const idx = contextTracks.findIndex(t => t.id === track.id);
      if (idx !== -1) {
        playQueue = contextTracks.slice(idx);
      } else {
        playQueue = [track];
      }
    }
  } else {
    // Single track playing
    originalQueue = [track];
    playQueue = [track];
  }

  // Clear previous track details and queue states
  audioPlayer.load();
  
  // Handle promise resolving on play to bypass modern browser autoplay blocks
  const playPromise = audioPlayer.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        isPlaying = true;
        updatePlayPauseUI();
      })
      .catch(error => {
        console.warn("Autoplay block: Click play manually.", error);
        isPlaying = false;
        updatePlayPauseUI();
      });
  }

  // Update DOM player bars
  updatePlayerUI();
  updateAmbientTheme(track.color);
  updateActiveSongRowHighlight();
  renderQueueList();
}

function togglePlayPause() {
  if (!currentTrack) {
    // If no song is loaded, play the first song in library
    if (songs.length > 0) {
      playTrack(songs[0], songs);
    }
    return;
  }

  if (isPlaying) {
    audioPlayer.pause();
  } else {
    audioPlayer.play().catch(err => console.log("Play failed", err));
  }
}

function playNext() {
  if (playQueue.length > 1) {
    // Add current track to history stack
    playHistory.push(currentTrack);
    historyIndex = playHistory.length - 1;

    // Shift queue
    playQueue.shift();
    const nextSong = playQueue[0];
    playTrack(nextSong, playQueue);
  } else {
    // End of queue
    if (repeatMode === 1) {
      // Repeat All: restart original queue
      playTrack(originalQueue[0], originalQueue);
    } else {
      // Stop playback
      audioPlayer.currentTime = 0;
      audioPlayer.pause();
      isPlaying = false;
      updatePlayPauseUI();
    }
  }
}

function playPrevious() {
  if (audioPlayer.currentTime > 5) {
    // If song has played for more than 5s, restart it
    audioPlayer.currentTime = 0;
  } else if (playHistory.length > 0 && historyIndex >= 0) {
    // Pull song from our back history
    const prevSong = playHistory[historyIndex];
    playHistory.pop();
    historyIndex--;
    
    // Add current track back to front of playQueue
    playQueue.unshift(currentTrack);
    playTrack(prevSong, playQueue);
  } else {
    // Just restart song if no history exists
    audioPlayer.currentTime = 0;
  }
}

function handleTrackEnded() {
  if (repeatMode === 2) {
    // Repeat single song
    audioPlayer.currentTime = 0;
    audioPlayer.play();
  } else {
    // Next track
    playNext();
  }
}

function seekAudio(percent) {
  if (!audioPlayer.duration) return;
  const seekTime = (percent / 100) * audioPlayer.duration;
  audioPlayer.currentTime = seekTime;
}

function handleTimeUpdate() {
  const current = audioPlayer.currentTime;
  const total = audioPlayer.duration || 0;
  
  // Format timeline text
  document.getElementById("time-current").textContent = formatTime(current);
  document.getElementById("time-total").textContent = formatTime(total);

  // Update slider fill width
  const progressPercent = total > 0 ? (current / total) * 100 : 0;
  document.getElementById("progress-slider").value = progressPercent;
  document.getElementById("progress-bar-fill").style.width = `${progressPercent}%`;

  // Update synchronized scrolling lyrics
  handleLyricsSync(current);
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  const shuffleBtn = document.getElementById("player-shuffle");

  if (isShuffle) {
    shuffleBtn.classList.add("active");
    // Shuffle queue retaining the current song on top
    if (playQueue.length > 1) {
      const remaining = playQueue.slice(1);
      playQueue = [playQueue[0], ...shuffleArray(remaining)];
    }
  } else {
    shuffleBtn.classList.remove("active");
    // Restore original track sequences
    if (currentTrack) {
      const idx = originalQueue.findIndex(t => t.id === currentTrack.id);
      if (idx !== -1) {
        playQueue = originalQueue.slice(idx);
      }
    }
  }
  renderQueueList();
}

function toggleRepeat() {
  repeatMode = (repeatMode + 1) % 3; // 0 -> 1 -> 2 -> 0
  const repeatBtn = document.getElementById("player-repeat");
  repeatBtn.classList.remove("active");

  if (repeatMode === 1) {
    repeatBtn.classList.add("active");
    repeatBtn.innerHTML = '<i class="bi bi-repeat"></i>';
    repeatBtn.title = "Repeat: All";
  } else if (repeatMode === 2) {
    repeatBtn.classList.add("active");
    repeatBtn.innerHTML = '<i class="bi bi-repeat-1"></i>';
    repeatBtn.title = "Repeat: Track";
  } else {
    repeatBtn.innerHTML = '<i class="bi bi-repeat"></i>';
    repeatBtn.title = "Repeat: Off";
  }
}

function changeVolume(value) {
  audioPlayer.volume = value / 100;
  audioPlayer.muted = (value === 0);
  document.getElementById("volume-bar-fill").style.width = `${value}%`;
}

function toggleMute() {
  audioPlayer.muted = !audioPlayer.muted;
}

// UI Volume icon controller
function updateVolumeUI() {
  const icon = document.getElementById("volume-icon");
  const slider = document.getElementById("volume-slider");
  const fill = document.getElementById("volume-bar-fill");
  
  const val = isMuted ? 0 : Math.round(volumeValue * 100);
  slider.value = val;
  fill.style.width = `${val}%`;

  if (isMuted || val === 0) {
    icon.innerHTML = '<i class="bi bi-volume-mute"></i>';
  } else if (val < 30) {
    icon.innerHTML = '<i class="bi bi-volume-down"></i>';
  } else if (val < 70) {
    icon.innerHTML = '<i class="bi bi-volume-down-fill"></i>';
  } else {
    icon.innerHTML = '<i class="bi bi-volume-up"></i>';
  }
}

// Play All utility button
function playAllFromActiveView(viewType) {
  let tracksToPlay = [];

  if (viewType === 'library') {
    tracksToPlay = [...songs];
  } else if (viewType === 'liked') {
    tracksToPlay = songs.filter(s => likedTrackIds.includes(s.id));
  } else if (viewType === 'playlist') {
    const pl = customPlaylists.find(p => p.id === currentPlaylistId);
    if (pl && pl.songs.length > 0) {
      tracksToPlay = songs.filter(s => pl.songs.includes(s.id));
    }
  }

  if (tracksToPlay.length > 0) {
    playTrack(tracksToPlay[0], tracksToPlay);
  } else {
    alert("This list is empty!");
  }
}

// 7. PLAYER INTERFACE COMPONENT UPDATERS
function updatePlayerUI() {
  if (!currentTrack) return;

  // Bottom player bar details
  document.getElementById("player-song-title").textContent = currentTrack.title;
  document.getElementById("player-artist-name").textContent = currentTrack.artist;
  document.getElementById("player-cover").src = currentTrack.cover;

  // Update player heart icon
  const heart = document.getElementById("player-heart");
  if (likedTrackIds.includes(currentTrack.id)) {
    heart.innerHTML = '<i class="bi bi-heart-fill"></i>';
    heart.classList.add("active");
  } else {
    heart.innerHTML = '<i class="bi bi-heart"></i>';
    heart.classList.remove("active");
  }

  // Fullscreen overlay panels
  document.getElementById("visualizer-cover").src = currentTrack.cover;
  document.getElementById("visualizer-song-title").textContent = currentTrack.title;
  document.getElementById("visualizer-artist-name").textContent = currentTrack.artist;

  // Build Fullscreen scrolling lyrics
  renderFullscreenLyrics(currentTrack);
}

function updatePlayPauseUI() {
  const playBtn = document.getElementById("player-play-pause");
  if (isPlaying) {
    playBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
  } else {
    playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
  }

  // Sync any track cards/rows hovering play buttons dynamically if needed
  updateActiveSongRowHighlight();
}

function updateAmbientTheme(hexColor) {
  // Set main theme variable globally
  document.documentElement.style.setProperty('--theme-color', hexColor);
}

function updateActiveSongRowHighlight() {
  document.querySelectorAll(".tracks-table tbody tr").forEach(row => {
    const songId = row.getAttribute("data-song-id");
    
    if (currentTrack && songId === currentTrack.id) {
      row.classList.add("active-song-row");
      // Render pulsating visualizer in column #
      const numCol = row.querySelector(".col-num");
      if (numCol) {
        if (isPlaying) {
          numCol.innerHTML = `
            <div class="playing-equalizer">
              <div class="eq-bar"></div>
              <div class="eq-bar"></div>
              <div class="eq-bar"></div>
              <div class="eq-bar"></div>
            </div>
          `;
        } else {
          numCol.innerHTML = '<i class="bi bi-volume-up-fill" style="color: var(--spotify-green)"></i>';
        }
      }
    } else {
      row.classList.remove("active-song-row");
      // Restore numerical value
      const numCol = row.querySelector(".col-num");
      if (numCol) {
        const originalIndex = row.getAttribute("data-index");
        numCol.textContent = originalIndex;
      }
    }
  });
}

// 8. RENDER HOME VIEW
function renderHomeView() {
  // 1. Render Quick Play Cards Grid (First 6 tracks)
  const quickGrid = document.getElementById("quick-play-grid");
  quickGrid.innerHTML = "";

  const sliceCount = Math.min(6, songs.length);
  for (let i = 0; i < sliceCount; i++) {
    const song = songs[i];
    const card = document.createElement("div");
    card.className = "quick-card";
    card.setAttribute("data-song-id", song.id);
    card.addEventListener("click", () => playTrack(song, songs));
    
    card.innerHTML = `
      <img src="${song.cover}" class="quick-card-img" alt="${song.title}">
      <div class="quick-card-details">
        <span class="quick-card-title">${song.title}</span>
        <span class="quick-card-artist">${song.artist}</span>
      </div>
      <button class="quick-play-hover-btn" title="Play">
        <i class="bi bi-play-fill"></i>
      </button>
    `;
    quickGrid.appendChild(card);
  }

  // 2. Render Featured Category Sliders
  const featured = document.getElementById("featured-sections");
  featured.innerHTML = "";

  // Unique categories
  const categories = ["Sai Abhyankkar Hits", "Cinematic BGMs", "Mass Beats", "Melodies & Love", "Club Remixes"];
  
  categories.forEach(catName => {
    const catSongs = songs.filter(s => s.category === catName);
    if (catSongs.length === 0) return;

    const row = document.createElement("div");
    row.className = "section-row";
    
    let iconClass = "bi-music-note-beamed";
    if (catName.includes("Hits")) iconClass = "bi-stars";
    else if (catName.includes("Cinematic")) iconClass = "bi-camera-reels-fill";
    else if (catName.includes("Mass")) iconClass = "bi-fire";
    else if (catName.includes("Love")) iconClass = "bi-heart-pulse-fill";
    else if (catName.includes("Remixes")) iconClass = "bi-disc-fill";

    row.innerHTML = `
      <h2 class="section-title"><i class="bi ${iconClass}" style="color:var(--spotify-green)"></i> ${catName}</h2>
      <div class="cards-slider-grid"></div>
    `;

    const slider = row.querySelector(".cards-slider-grid");

    catSongs.forEach(song => {
      const card = document.createElement("div");
      card.className = "track-card";
      card.addEventListener("click", () => playTrack(song, catSongs));
      
      // Setup context menu listeners on card
      card.addEventListener("contextmenu", (e) => {
        handleContextMenu(e, song.id);
      });

      card.innerHTML = `
        <div class="track-card-img-wrapper">
          <img src="${song.cover}" class="track-card-img" alt="${song.title}">
          <button class="card-play-btn" title="Play">
            <i class="bi bi-play-fill"></i>
          </button>
        </div>
        <div class="track-card-details">
          <span class="track-card-title">${song.title}</span>
          <span class="track-card-artist">${song.artist}</span>
        </div>
      `;
      slider.appendChild(card);
    });

    featured.appendChild(row);
  });
}

// 9. RENDER LIBRARY VIEW
function renderLibraryView(filterText = "") {
  const tbody = document.getElementById("library-tracks-tbody");
  tbody.innerHTML = "";

  const query = filterText.toLowerCase();
  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(query) || 
    s.artist.toLowerCase().includes(query) ||
    s.album.toLowerCase().includes(query)
  );

  document.getElementById("library-meta").textContent = `${filteredSongs.length} Songs total`;

  filteredSongs.forEach((song, idx) => {
    const row = createTrackRow(song, idx + 1, filteredSongs);
    tbody.appendChild(row);
  });

  updateActiveSongRowHighlight();
}

// 10. RENDER LIKED SONGS VIEW
function renderLikedSongsView() {
  const tbody = document.getElementById("liked-tracks-tbody");
  tbody.innerHTML = "";

  const likedTracks = songs.filter(s => likedTrackIds.includes(s.id));
  
  const totalCount = likedTracks.length;
  document.getElementById("liked-banner-meta").textContent = `${totalCount} Songs`;
  document.getElementById("liked-songs-count").textContent = `${totalCount} songs`;

  const emptyMsg = document.getElementById("liked-empty-msg");
  const tableWrap = document.getElementById("liked-table-wrapper");

  if (totalCount === 0) {
    emptyMsg.style.display = "block";
    tableWrap.style.display = "none";
  } else {
    emptyMsg.style.display = "none";
    tableWrap.style.display = "block";

    likedTracks.forEach((song, idx) => {
      const row = createTrackRow(song, idx + 1, likedTracks);
      tbody.appendChild(row);
    });
  }

  updateActiveSongRowHighlight();
}

// 11. CUSTOM PLAYLIST RENDERING & MUTATIONS
function openCreatePlaylistModal() {
  const modal = document.getElementById("playlist-modal");
  modal.style.display = "flex";
  
  // Suggest a playlist name
  const nameInput = document.getElementById("playlist-name-input");
  nameInput.value = `My Playlist #${customPlaylists.length + 1}`;
  nameInput.focus();
  nameInput.select();
  
  document.getElementById("modal-error-msg").textContent = "";
}

function closePlaylistModal() {
  document.getElementById("playlist-modal").style.display = "none";
}

function submitCreatePlaylist() {
  const nameInput = document.getElementById("playlist-name-input");
  const name = nameInput.value.trim();
  const error = document.getElementById("modal-error-msg");

  if (name.length === 0) {
    error.textContent = "Playlist name cannot be empty.";
    return;
  }

  // Create new playlist object
  const newPl = {
    id: `playlist-${Date.now()}`,
    name: name,
    songs: []
  };

  customPlaylists.push(newPl);
  saveToLocalStorage();
  closePlaylistModal();
  renderSidebarPlaylists();
  
  // Navigate to this playlist immediately
  navigateView('playlist', newPl.id);
}

function renderSidebarPlaylists() {
  const list = document.getElementById("playlists-sidebar-list");
  list.innerHTML = "";

  customPlaylists.forEach(pl => {
    const item = document.createElement("div");
    item.className = "playlist-sidebar-item";
    item.setAttribute("data-playlist-id", pl.id);
    
    // Highlight if active
    if (currentView === 'playlist' && currentPlaylistId === pl.id) {
      item.classList.add("active");
    }

    item.addEventListener("click", () => {
      navigateView('playlist', pl.id);
    });

    item.innerHTML = `
      <div class="playlist-sidebar-icon">
        <i class="bi bi-music-note-list"></i>
      </div>
      <span class="playlist-sidebar-name">${pl.name}</span>
    `;
    list.appendChild(item);
  });
}

function renderPlaylistView(playlistId) {
  const pl = customPlaylists.find(p => p.id === playlistId);
  if (!pl) return;

  // Title Banner Details
  document.getElementById("playlist-view-title").textContent = pl.name;
  document.getElementById("playlist-view-meta").textContent = `${pl.songs.length} songs`;

  // Render Rows
  const tbody = document.getElementById("playlist-tracks-tbody");
  tbody.innerHTML = "";

  const emptyMsg = document.getElementById("playlist-empty-msg");
  const tableWrap = document.getElementById("playlist-table-wrapper");

  // Get track objects associated with playlist
  const plSongs = songs.filter(s => pl.songs.includes(s.id));

  if (plSongs.length === 0) {
    emptyMsg.style.display = "block";
    tableWrap.style.display = "none";
  } else {
    emptyMsg.style.display = "none";
    tableWrap.style.display = "block";

    plSongs.forEach((song, idx) => {
      const row = createTrackRow(song, idx + 1, plSongs);
      tbody.appendChild(row);
    });
  }

  // Active playlist visual highlight in sidebar
  document.querySelectorAll(".playlist-sidebar-item").forEach(item => {
    if (item.getAttribute("data-playlist-id") === playlistId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  updateActiveSongRowHighlight();
}

function savePlaylistTitleFromEdit() {
  const editTitle = document.getElementById("playlist-view-title").textContent.trim();
  const pl = customPlaylists.find(p => p.id === currentPlaylistId);
  if (pl && editTitle.length > 0) {
    pl.name = editTitle;
    saveToLocalStorage();
    renderSidebarPlaylists();
  } else if (pl) {
    // Revert if empty
    document.getElementById("playlist-view-title").textContent = pl.name;
  }
}

function deleteActivePlaylist() {
  if (!currentPlaylistId) return;
  const pl = customPlaylists.find(p => p.id === currentPlaylistId);
  if (!pl) return;

  if (confirm(`Are you sure you want to delete the playlist "${pl.name}"?`)) {
    customPlaylists = customPlaylists.filter(p => p.id !== currentPlaylistId);
    saveToLocalStorage();
    renderSidebarPlaylists();
    navigateView('home');
  }
}

// 12. TRACK TABLE ROW FACTORY
function createTrackRow(song, index, fullContextTracks = []) {
  const tr = document.createElement("tr");
  tr.setAttribute("data-song-id", song.id);
  tr.setAttribute("data-index", index);

  // Setup double-click listener to play
  tr.addEventListener("dblclick", () => {
    playTrack(song, fullContextTracks);
  });

  // Setup context menu triggers (Right click)
  tr.addEventListener("contextmenu", (e) => {
    handleContextMenu(e, song.id);
  });

  // Heart Icon State
  const likedClass = likedTrackIds.includes(song.id) ? "active" : "";
  const likedIcon = likedTrackIds.includes(song.id) ? "bi-heart-fill" : "bi-heart";

  tr.innerHTML = `
    <td class="col-num">${index}</td>
    <td class="col-title">
      <div class="song-title-wrapper">
        <img src="${song.cover}" class="row-cover" alt="">
        <div class="song-row-text">
          <span class="song-row-title">${song.title}</span>
          <span class="song-row-artist">${song.artist}</span>
        </div>
      </div>
    </td>
    <td class="col-album">${song.album}</td>
    <td class="col-action">
      <button class="song-row-liked-btn ${likedClass}" onclick="toggleLikeSong(event, '${song.id}')" title="Like track">
        <i class="bi ${likedIcon}"></i>
      </button>
    </td>
    <td class="col-duration">${song.duration}</td>
  `;

  return tr;
}

// 13. SEARCH FILTER & GENRES
function performSearch(query) {
  document.getElementById("genres-section").style.display = "none";
  document.getElementById("search-results-section").style.display = "block";

  const tbody = document.getElementById("search-results-tbody");
  tbody.innerHTML = "";

  const q = query.toLowerCase();
  const matched = songs.filter(s => 
    s.title.toLowerCase().includes(q) || 
    s.artist.toLowerCase().includes(q) ||
    s.album.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q)
  );

  if (matched.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 30px; color: var(--text-grey);">
          No results found for "${query}"
        </td>
      </tr>
    `;
  } else {
    matched.forEach((song, idx) => {
      const row = createTrackRow(song, idx + 1, matched);
      tbody.appendChild(row);
    });
  }

  updateActiveSongRowHighlight();
}

function renderGenresGrid() {
  const grid = document.getElementById("genres-cards-grid");
  grid.innerHTML = "";

  const genres = [
    { name: "Sai Abhyankkar Hits", color: "linear-gradient(135deg, #1b4f35 0%, #0d2c1e 100%)", img: "https://images.unsplash.com/photo-1516280440614-37939bbacd6a?w=150&h=150&fit=crop&q=80" },
    { name: "Cinematic BGMs", color: "linear-gradient(135deg, #2c3e50 0%, #0f171e 100%)", img: "https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?w=150&h=150&fit=crop&q=80" },
    { name: "Mass Beats", color: "linear-gradient(135deg, #7d0b11 0%, #3a0004 100%)", img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&h=150&fit=crop&q=80" },
    { name: "Melodies & Love", color: "linear-gradient(135deg, #7353ba 0%, #3e1b73 100%)", img: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=150&h=150&fit=crop&q=80" },
    { name: "Club Remixes", color: "linear-gradient(135deg, #e01a4f 0%, #6e001f 100%)", img: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=150&h=150&fit=crop&q=80" }
  ];

  genres.forEach(g => {
    const card = document.createElement("div");
    card.className = "genre-card";
    card.style.background = g.color;
    
    card.addEventListener("click", () => {
      const searchInput = document.getElementById("search-input");
      const clearSearchBtn = document.getElementById("clear-search-btn");
      
      searchInput.value = g.name;
      clearSearchBtn.style.display = "block";
      performSearch(g.name);
    });

    card.innerHTML = `
      <span class="genre-card-title">${g.name}</span>
      <img src="${g.img}" class="genre-card-img" alt="${g.name}">
    `;
    grid.appendChild(card);
  });
}

// 14. CUSTOM CONTEXT MENU CONTROLS
function handleContextMenu(e, songId) {
  e.preventDefault();
  contextMenuTargetTrackId = songId;

  const menu = document.getElementById("custom-context-menu");
  
  // Render submenus (Playlists available)
  const submenuList = document.getElementById("context-submenu-playlists");
  submenuList.innerHTML = "";

  // "Create new playlist..." option
  const createOption = document.createElement("div");
  createOption.className = "submenu-item";
  createOption.innerHTML = '<i class="bi bi-plus-circle"></i> Create New...';
  createOption.addEventListener("click", () => {
    menu.style.display = "none";
    openCreatePlaylistModal();
  });
  submenuList.appendChild(createOption);

  if (customPlaylists.length > 0) {
    const hr = document.createElement("hr");
    hr.className = "context-divider";
    submenuList.appendChild(hr);

    customPlaylists.forEach(pl => {
      const subItem = document.createElement("div");
      subItem.className = "submenu-item";
      
      // Display indicators if track is already in that playlist
      const isInPlaylist = pl.songs.includes(songId);
      subItem.innerHTML = `
        <i class="bi ${isInPlaylist ? 'bi-check-circle-fill' : 'bi-music-note-list'}" 
           style="color: ${isInPlaylist ? 'var(--spotify-green)' : 'inherit'}"></i>
        <span>${pl.name}</span>
      `;

      subItem.addEventListener("click", () => {
        toggleSongInPlaylist(songId, pl.id);
        menu.style.display = "none";
      });

      submenuList.appendChild(subItem);
    });
  }

  // Handle Remove option (only visible if we are currently inside a custom playlist view)
  const deleteOpt = document.getElementById("context-delete-playlist-option");
  if (currentView === 'playlist') {
    deleteOpt.style.display = "flex";
  } else {
    deleteOpt.style.display = "none";
  }

  // Position custom menu absolute coords
  menu.style.display = "flex";
  
  // Check bounds
  let posX = e.clientX;
  let posY = e.clientY;
  
  const menuWidth = 220;
  const menuHeight = 250;
  
  if (posX + menuWidth > window.innerWidth) {
    posX -= menuWidth;
  }
  if (posY + menuHeight > window.innerHeight) {
    posY -= menuHeight;
  }

  menu.style.left = `${posX}px`;
  menu.style.top = `${posY}px`;
}

function contextPlayNext() {
  if (!contextMenuTargetTrackId) return;
  const track = songs.find(s => s.id === contextMenuTargetTrackId);
  if (!track) return;

  // Insert track right after current index inside playQueue
  playQueue = playQueue.filter(t => t.id !== track.id);
  playQueue.splice(1, 0, track);

  alert(`"${track.title}" will play next!`);
  document.getElementById("custom-context-menu").style.display = "none";
  renderQueueList();
}

function contextAddToQueue() {
  if (!contextMenuTargetTrackId) return;
  const track = songs.find(s => s.id === contextMenuTargetTrackId);
  if (!track) return;

  // Append track to queue
  playQueue = playQueue.filter(t => t.id !== track.id);
  playQueue.push(track);

  alert(`"${track.title}" added to queue.`);
  document.getElementById("custom-context-menu").style.display = "none";
  renderQueueList();
}

function contextToggleLike() {
  if (!contextMenuTargetTrackId) return;
  toggleLikeSong(null, contextMenuTargetTrackId);
  document.getElementById("custom-context-menu").style.display = "none";
}

function contextRemoveFromCurrentPlaylist() {
  if (!contextMenuTargetTrackId || currentView !== 'playlist') return;
  toggleSongInPlaylist(contextMenuTargetTrackId, currentPlaylistId, true);
  document.getElementById("custom-context-menu").style.display = "none";
}

function toggleSongInPlaylist(songId, playlistId, forceRemove = false) {
  const pl = customPlaylists.find(p => p.id === playlistId);
  if (!pl) return;

  const idx = pl.songs.indexOf(songId);
  const track = songs.find(s => s.id === songId);

  if (idx !== -1 || forceRemove) {
    pl.songs.splice(idx, 1);
    alert(`Removed "${track.title}" from "${pl.name}"`);
  } else {
    pl.songs.push(songId);
    alert(`Added "${track.title}" to "${pl.name}"`);
  }

  saveToLocalStorage();
  
  if (currentView === 'playlist' && currentPlaylistId === playlistId) {
    renderPlaylistView(playlistId);
  }
}

function toggleLikeSong(event, songId) {
  if (event) {
    event.stopPropagation();
  }

  const idx = likedTrackIds.indexOf(songId);
  const song = songs.find(s => s.id === songId);

  if (idx !== -1) {
    // Unlike song
    likedTrackIds.splice(idx, 1);
    song.liked = false;
  } else {
    // Like song
    likedTrackIds.push(songId);
    song.liked = true;
  }

  saveToLocalStorage();
  updateLikedSongsCount();

  // Refresh active views
  if (currentView === 'liked') {
    renderLikedSongsView();
  } else if (currentView === 'library') {
    renderLibraryView();
  } else if (currentView === 'search') {
    const searchVal = document.getElementById("search-input").value;
    if (searchVal) performSearch(searchVal);
  }

  // Update play bar heart state if current track matches
  if (currentTrack && currentTrack.id === songId) {
    const heart = document.getElementById("player-heart");
    if (song.liked) {
      heart.innerHTML = '<i class="bi bi-heart-fill"></i>';
      heart.classList.add("active");
    } else {
      heart.innerHTML = '<i class="bi bi-heart"></i>';
      heart.classList.remove("active");
    }
  }

  updateActiveSongRowHighlight();
}

function toggleLikeCurrentSong() {
  if (!currentTrack) return;
  toggleLikeSong(null, currentTrack.id);
}

function updateLikedSongsCount() {
  const total = likedTrackIds.length;
  document.getElementById("liked-songs-count").textContent = `${total} songs`;
}

// 15. PLAY QUEUE DRAWER PANELS
function toggleQueueDrawer() {
  const drawer = document.getElementById("queue-drawer");
  const queueToggleBtn = document.getElementById("player-queue-toggle");
  
  drawer.classList.toggle("open");
  queueToggleBtn.classList.toggle("active");

  if (drawer.classList.contains("open")) {
    renderQueueList();
  }
}

function renderQueueList() {
  const currentItem = document.getElementById("queue-now-playing-item");
  const nextList = document.getElementById("queue-next-list");

  currentItem.innerHTML = "";
  nextList.innerHTML = "";

  if (!currentTrack) {
    currentItem.innerHTML = '<p class="playlist-empty-notice">No track playing</p>';
    nextList.innerHTML = '<p class="playlist-empty-notice">Queue is empty</p>';
    return;
  }

  // Render Now Playing Item
  currentItem.innerHTML = `
    <div class="queue-item">
      <img src="${currentTrack.cover}" class="queue-item-img" alt="">
      <div class="queue-item-details">
        <span class="queue-item-title">${currentTrack.title}</span>
        <span class="queue-item-artist">${currentTrack.artist}</span>
      </div>
    </div>
  `;

  // Render Next in Queue (Maximum 15 tracks to save render cycles)
  if (playQueue.length <= 1) {
    nextList.innerHTML = '<p class="playlist-empty-notice">Queue is empty</p>';
    return;
  }

  const nextSongs = playQueue.slice(1, 16);
  nextSongs.forEach((song, idx) => {
    const qItem = document.createElement("div");
    qItem.className = "queue-item";
    
    qItem.innerHTML = `
      <img src="${song.cover}" class="queue-item-img" alt="">
      <div class="queue-item-details">
        <span class="queue-item-title">${song.title}</span>
        <span class="queue-item-artist">${song.artist}</span>
      </div>
      <button class="queue-item-remove" onclick="removeSongFromQueue(event, ${idx + 1})" title="Remove">
        <i class="bi bi-x-circle-fill"></i>
      </button>
    `;
    nextList.appendChild(qItem);
  });
}

function removeSongFromQueue(event, queueIndex) {
  event.stopPropagation();
  if (queueIndex > 0 && queueIndex < playQueue.length) {
    const removedSong = playQueue[queueIndex];
    playQueue.splice(queueIndex, 1);
    alert(`Removed "${removedSong.title}" from queue.`);
    renderQueueList();
  }
}

function clearQueue() {
  if (confirm("Are you sure you want to clear your current queue?")) {
    playQueue = [currentTrack]; // keep only now playing
    renderQueueList();
  }
}

// 16. FULLSCREEN AMBIENT LYRICS & AUDIO VISUALIZER
let visualizerCanvas, visualizerCtx;

function toggleFullscreenOverlay() {
  const panel = document.getElementById("fullscreen-overlay");
  panel.classList.toggle("open");

  // Sync accessory button focus
  const btn = document.getElementById("player-lyrics-toggle");
  btn.classList.toggle("active");

  if (panel.classList.contains("open")) {
    // Trigger canvas visualizer size fitting
    setupCanvas();
    if (isPlaying) {
      startVisualizer();
    }
  } else {
    stopVisualizer();
  }
}

function setupCanvas() {
  visualizerCanvas = document.getElementById("visualizer-canvas");
  visualizerCtx = visualizerCanvas.getContext("2d");
  
  // Set logical dimensions matching container scale
  visualizerCanvas.width = visualizerCanvas.parentElement.clientWidth;
  visualizerCanvas.height = visualizerCanvas.parentElement.clientHeight;
  
  window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas() {
  if (visualizerCanvas && document.getElementById("fullscreen-overlay").classList.contains("open")) {
    visualizerCanvas.width = visualizerCanvas.parentElement.clientWidth;
    visualizerCanvas.height = visualizerCanvas.parentElement.clientHeight;
  }
}

function startVisualizer() {
  if (!visualizerCanvas) return;
  if (visualizerAnimationFrame) cancelAnimationFrame(visualizerAnimationFrame);
  
  function draw() {
    visualizerAnimationFrame = requestAnimationFrame(draw);
    
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    
    // Clear canvas
    visualizerCtx.clearRect(0, 0, width, height);

    // Compute frequency jumps simulated around active track tempo
    const count = 40;
    const spacing = width / count;
    
    // Ambient neon visualizer theme
    const activeColor = currentTrack ? currentTrack.color : '#1db954';
    
    visualizerCtx.lineWidth = 3;
    visualizerCtx.lineCap = "round";

    for (let i = 0; i < count; i++) {
      // Simulate jumping spectrum peaks
      if (isPlaying) {
        // High frequencies jump faster, low frequencies slower
        const speed = i % 2 === 0 ? 0.05 : 0.08;
        const target = Math.random() * (height - 30);
        simulatedFrequencies[i] += (target - simulatedFrequencies[i]) * speed;
      } else {
        // Fall down
        simulatedFrequencies[i] += (0 - simulatedFrequencies[i]) * 0.1;
      }

      // Draw glowing spectrum bars
      const barHeight = simulatedFrequencies[i];
      const x = i * spacing + spacing / 2;
      const y = height - barHeight;

      // Glowing effect
      visualizerCtx.shadowBlur = 15;
      visualizerCtx.shadowColor = activeColor;
      
      const grad = visualizerCtx.createLinearGradient(0, height, 0, y);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      grad.addColorStop(0.5, activeColor);
      grad.addColorStop(1, '#ffffff');
      
      visualizerCtx.strokeStyle = grad;
      
      visualizerCtx.beginPath();
      visualizerCtx.moveTo(x, height);
      visualizerCtx.lineTo(x, y);
      visualizerCtx.stroke();
    }
  }

  draw();
}

function stopVisualizer() {
  if (visualizerAnimationFrame) {
    cancelAnimationFrame(visualizerAnimationFrame);
    visualizerAnimationFrame = null;
  }
  window.removeEventListener("resize", resizeCanvas);
}

// 17. SYNCED LYRICS SCROLL ENGINE
let lyricLinesData = [];

function renderFullscreenLyrics(track) {
  const container = document.getElementById("lyrics-scroll-box");
  container.innerHTML = "";
  lyricLinesData = [];

  if (!track.lyrics || track.lyrics.length === 0) {
    // Generate simulated generic BGM beats lines
    track.lyrics = [
      { time: 0, text: `🎵 Playing ${track.title} 🎵` },
      { time: 5, text: `Track by ${track.artist}` },
      { time: 10, text: `[Enjoy the BGM beats...]` },
      { time: 20, text: `[Deep bass layers unfolding]` },
      { time: 40, text: `[Instrumental Solo]` },
      { time: 70, text: `[Catchy synthetic rhythm dynamic]` },
      { time: 95, text: `[Intense melody chorus loop]` },
      { time: 130, text: `🎵 BeatBox Ultimate Beats experience 🎵` }
    ];
  }

  lyricLinesData = track.lyrics;

  lyricLinesData.forEach((line, idx) => {
    const el = document.createElement("p");
    el.className = "lyrics-line";
    el.textContent = line.text;
    el.setAttribute("data-time", line.time);
    el.addEventListener("click", () => {
      // Jump to lyric line timestamp on click
      audioPlayer.currentTime = line.time;
      if (!isPlaying) {
        audioPlayer.play().catch(e => console.log(e));
      }
    });
    container.appendChild(el);
  });
}

function handleLyricsSync(currentTime) {
  const overlay = document.getElementById("fullscreen-overlay");
  if (!overlay.classList.contains("open") || lyricLinesData.length === 0) return;

  // Find active lyric line matching current playback seconds
  let activeIndex = -1;
  for (let i = 0; i < lyricLinesData.length; i++) {
    if (currentTime >= lyricLinesData[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  if (activeIndex !== -1) {
    const lines = document.querySelectorAll(".lyrics-line");
    lines.forEach((line, idx) => {
      if (idx === activeIndex) {
        if (!line.classList.contains("active-lyric")) {
          line.classList.add("active-lyric");
          // Smooth scroll to center the active line in viewport
          const container = document.getElementById("lyrics-scroll-box");
          const offsetTop = line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2;
          container.scrollTo({
            top: Math.max(0, offsetTop),
            behavior: "smooth"
          });
        }
      } else {
        line.classList.remove("active-lyric");
      }
    });
  }
}

// 18. FORMAT UTILITIES
function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Shuffle Helper
function shuffleArray(array) {
  let arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
