const API_URL = 'https://gudided-ai.vercel.app/api';
let currentIntent = null;
let conversationHistory = [];
let currentCategory = null;
let lastQuestion = null;
let lastAnswer = null;
let currentLanguage = 'en';

// Language names
const languageNames = {
    'en': 'English', 'hi': 'Hindi', 'ta': 'Tamil', 'kn': 'Kannada',
    'te': 'Telugu', 'ml': 'Malayalam', 'fr': 'French', 'de': 'German',
    'es': 'Spanish', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese'
};

// Recent searches
let recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');

// DOM Elements
const intentSelect = document.getElementById('intentSelect');
const categorySelect = document.getElementById('categorySelect');
const categorySection = document.getElementById('categorySection');
const messagesContainer = document.getElementById('messagesContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const clearChatBtn = document.getElementById('clearChat');
const assistantNameSpan = document.getElementById('assistantName');
const downloadChatBtn = document.getElementById('downloadChat');
const shareChatBtn = document.getElementById('shareChat');
const clearAllRecentBtn = document.getElementById('clearAllRecent');
const voiceInputBtn = document.getElementById('voiceInputBtn');
const voiceOutputBtn = document.getElementById('voiceOutputBtn');
const stopSpeakingBtn = document.getElementById('stopSpeakingBtn');
const languageSelect = document.getElementById('languageSelect');

// Voice variables
let listeningOverlay = null;
let isListening = false;
let recognition = null;
let synth = window.speechSynthesis;
let isSpeaking = false;
let autoSpeakEnabled = false;
let microphonePermissionGranted = false;
let typingDiv = null;

// ============ QUICK ACTIONS ============

window.askQuick = function(question) {
    userInput.value = question;
    sendMessage();
};

// ============ 3D AVATAR CONTROL FUNCTIONS ============

function startAvatarSpeaking() {
    if (window.startAvatarSpeaking) {
        window.startAvatarSpeaking();
    }
}

function stopAvatarSpeaking() {
    if (window.stopAvatarSpeaking) {
        window.stopAvatarSpeaking();
    }
}

function setAvatarListening(listening) {
    if (window.setAvatarListening) {
        window.setAvatarListening(listening);
    }
}

function setAvatarThinking(thinking) {
    if (window.setAvatarThinking) {
        window.setAvatarThinking(thinking);
    }
}

// ============ TRANSLATION FUNCTIONS ============

async function translateText(text, targetLang) {
    if (!text || text.trim() === '') return text;
    if (targetLang === 'en') return text;
    
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && data[0]) {
            let translatedText = '';
            for (let i = 0; i < data[0].length; i++) {
                translatedText += data[0][i][0];
            }
            return translatedText;
        }
        return text;
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

function showTranslationIndicator(message) {
    const existing = document.querySelector('.translation-indicator');
    if (existing) existing.remove();
    
    const indicator = document.createElement('div');
    indicator.className = 'translation-indicator';
    indicator.innerHTML = `<i class="fas fa-language"></i> ${message}`;
    document.body.appendChild(indicator);
    
    setTimeout(() => {
        if (indicator) indicator.remove();
    }, 2000);
}

// ============ VOICE FEATURES ============

function cleanTextForSpeech(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/[📌🔹✅📋💡🎯⚠️✨🎨🔊🎤🌐⏹️❌✅⭐💡📍🔍❓❗]/g, '')
        .replace(/[•\-*]/g, '')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function showListeningOverlay() {
    if (listeningOverlay) listeningOverlay.remove();
    listeningOverlay = document.createElement('div');
    listeningOverlay.className = 'listening-overlay';
    listeningOverlay.innerHTML = `<i class="fas fa-microphone"></i><span>🎤 Listening in ${languageNames[currentLanguage]}...</span><div class="wave-animation"><span></span><span></span><span></span><span></span><span></span></div>`;
    document.body.appendChild(listeningOverlay);
}

function hideListeningOverlay() {
    if (listeningOverlay) { listeningOverlay.remove(); listeningOverlay = null; }
}

function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        if (voiceInputBtn) { voiceInputBtn.disabled = true; voiceInputBtn.style.opacity = '0.5'; }
        return false;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    const langMap = { 'en': 'en-US', 'hi': 'hi-IN', 'ta': 'ta-IN', 'kn': 'kn-IN', 'te': 'te-IN', 'ml': 'ml-IN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES', 'ja': 'ja-JP', 'ko': 'ko-KR', 'zh': 'zh-CN' };
    recognition.lang = langMap[currentLanguage] || 'en-US';
    
    recognition.onstart = () => {
        isListening = true;
        if (voiceInputBtn) voiceInputBtn.classList.add('listening');
        showListeningOverlay();
        setAvatarListening(true);
    };
    
    recognition.onend = () => {
        isListening = false;
        if (voiceInputBtn) voiceInputBtn.classList.remove('listening');
        hideListeningOverlay();
        setAvatarListening(false);
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim()) {
            userInput.value = transcript;
            sendMessage();
        }
        recognition.stop();
    };
    
    recognition.onerror = () => {
        isListening = false;
        if (voiceInputBtn) voiceInputBtn.classList.remove('listening');
        hideListeningOverlay();
        setAvatarListening(false);
    };
    
    return true;
}

function startVoiceInput() {
    if (!recognition) { initSpeechRecognition(); }
    if (isListening) { recognition.stop(); return; }
    
    const langMap = { 'en': 'en-US', 'hi': 'hi-IN', 'ta': 'ta-IN', 'kn': 'kn-IN', 'te': 'te-IN', 'ml': 'ml-IN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES', 'ja': 'ja-JP', 'ko': 'ko-KR', 'zh': 'zh-CN' };
    recognition.lang = langMap[currentLanguage] || 'en-US';
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
            microphonePermissionGranted = true;
            recognition.start();
        })
        .catch(err => console.error('Microphone error:', err));
}

function stopSpeaking() {
    if (synth && isSpeaking) { 
        synth.cancel(); 
        isSpeaking = false; 
        if (voiceOutputBtn) voiceOutputBtn.classList.remove('speaking');
        stopAvatarSpeaking();
    }
}

function speakText(text) {
    if (!synth) return;
    if (isSpeaking) synth.cancel();
    
    startAvatarSpeaking();
    
    let cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;
    if (cleanText.length > 1000) cleanText = cleanText.substring(0, 1000);
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const langMap = { 'en': 'en-US', 'hi': 'hi-IN', 'ta': 'ta-IN', 'kn': 'kn-IN', 'te': 'te-IN', 'ml': 'ml-IN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES', 'ja': 'ja-JP', 'ko': 'ko-KR', 'zh': 'zh-CN' };
    utterance.lang = langMap[currentLanguage] || 'en-US';
    utterance.rate = 0.9;
    utterance.onstart = () => { 
        isSpeaking = true; 
        if (voiceOutputBtn) voiceOutputBtn.classList.add('speaking'); 
    };
    utterance.onend = () => { 
        isSpeaking = false; 
        if (voiceOutputBtn) voiceOutputBtn.classList.remove('speaking'); 
        stopAvatarSpeaking(); 
    };
    utterance.onerror = () => { 
        isSpeaking = false; 
        if (voiceOutputBtn) voiceOutputBtn.classList.remove('speaking'); 
        stopAvatarSpeaking(); 
    };
    synth.speak(utterance);
}

if (voiceInputBtn) voiceInputBtn.addEventListener('click', startVoiceInput);
if (voiceOutputBtn) voiceOutputBtn.addEventListener('click', () => {
    const lastMessage = document.querySelector('.message.bot:last-child .message-content');
    if (lastMessage) speakText(lastMessage.innerText);
});
if (stopSpeakingBtn) stopSpeakingBtn.addEventListener('click', stopSpeaking);

function addAutoSpeakToggle() {
    const autoSpeakCheckbox = document.getElementById('autoSpeak');
    if (autoSpeakCheckbox) autoSpeakCheckbox.addEventListener('change', (e) => { autoSpeakEnabled = e.target.checked; });
}

initSpeechRecognition();

// ============ RECENT SEARCHES ============
function addToRecentSearches(query) {
    if (!query) return;
    recentSearches = recentSearches.filter(q => q !== query);
    recentSearches.unshift(query);
    recentSearches = recentSearches.slice(0, 10);
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
    renderRecentSearches();
}

function renderRecentSearches() {
    const recentList = document.getElementById('recentList');
    if (!recentList) return;
    if (recentSearches.length === 0) {
        recentList.innerHTML = '<div class="empty-recent">No recent searches</div>';
        return;
    }
    recentList.innerHTML = recentSearches.map(query => `
        <div class="recent-item" data-query="${query.replace(/"/g, '&quot;')}">
            <div class="recent-query"><i class="fas fa-search"></i><span>${query.length > 40 ? query.substring(0, 40) + '...' : query}</span></div>
            <button class="delete-recent" data-query="${query.replace(/"/g, '&quot;')}"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
    
    document.querySelectorAll('.recent-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-recent')) return;
            userInput.value = item.dataset.query;
            sendMessage();
        });
    });
    document.querySelectorAll('.delete-recent').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const query = btn.dataset.query;
            recentSearches = recentSearches.filter(q => q !== query);
            localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
            renderRecentSearches();
        });
    });
}

function clearAllRecent() {
    recentSearches = [];
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
    renderRecentSearches();
}
if (clearAllRecentBtn) clearAllRecentBtn.addEventListener('click', clearAllRecent);

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

function formatStructuredText(text) {
    let formatted = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/^(📌|🔹|✅|📋|💡|🎯)\s(.*?)$/gm, '<div class="section-header"><span class="section-icon">$1</span> <strong>$2</strong></div>');
    formatted = formatted.replace(/^[•\-*]\s+(.*?)$/gm, '<div class="bullet-item"><span class="bullet-icon">•</span> <span class="bullet-text">$1</span></div>');
    formatted = formatted.replace(/^(\d+)\.\s+(.*?)$/gm, '<div class="numbered-item"><span class="number">$1.</span> <span class="numbered-text">$2</span></div>');
    formatted = formatted.replace(/(<div class="bullet-item">.*?<\/div>\n?)+/g, '<div class="bullet-list">$&</div>');
    formatted = formatted.replace(/(<div class="numbered-item">.*?<\/div>\n?)+/g, '<div class="numbered-list">$&</div>');
    formatted = formatted.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    return formatted;
}

function addMessage(sender, content, showAvatar = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    if (showAvatar) {
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = sender === 'bot' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';
        messageDiv.appendChild(avatar);
    }
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    if (sender === 'bot') {
        messageContent.innerHTML = formatStructuredText(content);
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(content);
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { copyBtn.innerHTML = '<i class="fas fa-copy"></i>'; }, 2000);
        };
        messageContent.appendChild(copyBtn);
        
        const readBtn = document.createElement('button');
        readBtn.className = 'read-msg-btn';
        readBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        readBtn.onclick = () => speakText(content);
        messageContent.appendChild(readBtn);
        
        if (autoSpeakEnabled) speakText(content);
    } else {
        messageContent.innerHTML = `<p class="paragraph">${escapeHtml(content)}</p>`;
    }
    messageDiv.appendChild(messageContent);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
    if (typingDiv) return;
    typingDiv = document.createElement('div');
    typingDiv.className = 'message bot';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `<div class="message-avatar"><i class="fas fa-robot"></i></div><div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    setAvatarThinking(true);
}

function hideTypingIndicator() {
    if (typingDiv) { 
        typingDiv.remove(); 
        typingDiv = null; 
    }
    setAvatarThinking(false);
}

async function generateFollowups(question, answer) {
    try {
        const response = await fetch(`${API_URL}/followup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lastQuestion: question, lastAnswer: answer })
        });
        const data = await response.json();
        return data.followup || [];
    } catch (error) {
        return ["Tell me more", "Explain details", "Give examples", "Any tips?"];
    }
}

function addFollowupDropdown(questions) {
    const existing = document.querySelector('.followup-card');
    if (existing) existing.remove();
    if (!questions || questions.length === 0) return;
    
    const card = document.createElement('div');
    card.className = 'followup-card';
    card.innerHTML = `
        <div class="followup-header"><i class="fas fa-lightbulb"></i><span>You might also ask:</span></div>
        <select id="followupSelect" class="followup-select">
            <option value="">-- Select a question --</option>
            ${questions.map(q => `<option value="${escapeHtml(q)}">${escapeHtml(q)}</option>`).join('')}
        </select>
        <button id="askFollowupBtn" class="ask-followup-btn">Ask</button>
    `;
    messagesContainer.appendChild(card);
    
    document.getElementById('askFollowupBtn').onclick = () => {
        const selected = document.getElementById('followupSelect').value;
        if (selected) {
            userInput.value = selected;
            sendMessage();
            card.remove();
        }
    };
}

async function loadIntents() {
    try {
        const response = await fetch(`${API_URL}/intents`);
        const intents = await response.json();
        intentSelect.innerHTML = '<option value="">Choose a role...</option>';
        intents.forEach(intent => {
            const option = document.createElement('option');
            option.value = intent.id;
            option.textContent = intent.name;
            intentSelect.appendChild(option);
        });
        renderRecentSearches();
        addAutoSpeakToggle();
    } catch (error) {
        addMessage('bot', '❌ Cannot connect to server');
    }
}

intentSelect.addEventListener('change', async (e) => {
    currentIntent = e.target.value;
    if (!currentIntent) { categorySection.style.display = 'none'; return; }
    try {
        const response = await fetch(`${API_URL}/intents`);
        const intents = await response.json();
        const selected = intents.find(i => i.id === currentIntent);
        if (selected) {
            assistantNameSpan.textContent = selected.name;
            categorySelect.innerHTML = '<option value="">Choose a topic...</option>';
            selected.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                categorySelect.appendChild(option);
            });
            categorySection.style.display = 'block';
        }
    } catch (error) { addMessage('bot', 'Error loading categories'); }
});

if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        showTranslationIndicator(`🌐 Language changed to ${languageNames[currentLanguage]}`);
        
        if (recognition) {
            const langMap = { 'en': 'en-US', 'hi': 'hi-IN', 'ta': 'ta-IN', 'kn': 'kn-IN', 'te': 'te-IN', 'ml': 'ml-IN', 'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES', 'ja': 'ja-JP', 'ko': 'ko-KR', 'zh': 'zh-CN' };
            recognition.lang = langMap[currentLanguage] || 'en-US';
        }
    });
}

categorySelect.addEventListener('change', async (e) => {
    currentCategory = e.target.value;
    if (!currentCategory || !currentIntent) return;
    const question = `Tell me about ${currentCategory}`;
    lastQuestion = question;
    showTypingIndicator();
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                intent: currentIntent,
                category: currentCategory,
                userQuestion: question,
                conversationHistory: []
            })
        });
        const data = await response.json();
        hideTypingIndicator();
        if (data.response) {
            let finalResponse = data.response;
            if (currentLanguage !== 'en') {
                showTranslationIndicator(`Translating to ${languageNames[currentLanguage]}...`);
                finalResponse = await translateText(data.response, currentLanguage);
                showTranslationIndicator(`✅ Response translated to ${languageNames[currentLanguage]}`);
            }
            lastAnswer = finalResponse;
            addMessage('bot', finalResponse);
            addToRecentSearches(question);
            const followups = await generateFollowups(lastQuestion, lastAnswer);
            addFollowupDropdown(followups);
            conversationHistory.push({ role: "user", content: lastQuestion }, { role: "assistant", content: lastAnswer });
        }
    } catch (error) { hideTypingIndicator(); addMessage('bot', `Error: ${error.message}`); }
});

async function sendMessage() {
    const question = userInput.value.trim();
    if (!question) return;
    if (!currentIntent) { addMessage('bot', 'Select your role first.'); return; }
    if (!currentCategory) { addMessage('bot', 'Select a category first.'); return; }
    
    let finalQuestion = question;
    if (currentLanguage !== 'en') {
        showTranslationIndicator(`Translating your question to English...`);
        finalQuestion = await translateText(question, 'en');
        showTranslationIndicator(`✅ Question translated to English`);
    }
    
    addMessage('user', question);
    userInput.value = '';
    lastQuestion = finalQuestion;
    addToRecentSearches(question);
    showTypingIndicator();
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                intent: currentIntent,
                category: currentCategory,
                userQuestion: finalQuestion,
                conversationHistory: conversationHistory
            })
        });
        const data = await response.json();
        hideTypingIndicator();
        if (data.response) {
            let finalResponse = data.response;
            if (currentLanguage !== 'en') {
                showTranslationIndicator(`Translating response to ${languageNames[currentLanguage]}...`);
                finalResponse = await translateText(data.response, currentLanguage);
                showTranslationIndicator(`✅ Response translated to ${languageNames[currentLanguage]}`);
            }
            lastAnswer = finalResponse;
            addMessage('bot', finalResponse);
            const followups = await generateFollowups(lastQuestion, lastAnswer);
            addFollowupDropdown(followups);
            conversationHistory.push({ role: "user", content: finalQuestion }, { role: "assistant", content: lastAnswer });
            if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
        }
    } catch (error) { hideTypingIndicator(); addMessage('bot', `Error: ${error.message}`); }
}

function clearChat() {
    messagesContainer.innerHTML = '';
    conversationHistory = [];
    const welcome = document.createElement('div');
    welcome.className = 'message bot';
    welcome.innerHTML = `<div class="message-avatar"><i class="fas fa-robot"></i></div><div class="message-content">✨ Chat cleared! Select a category to start.</div>`;
    messagesContainer.appendChild(welcome);
}

function downloadChat() {
    const messages = [];
    document.querySelectorAll('.message').forEach(msg => {
        const sender = msg.classList.contains('user') ? 'User' : 'Assistant';
        const content = msg.querySelector('.message-content')?.innerText;
        if (content && !content.includes('followup')) messages.push(`${sender}: ${content}`);
    });
    const blob = new Blob([messages.join('\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function shareChat() {
    const messages = [];
    document.querySelectorAll('.message').forEach(msg => {
        const sender = msg.classList.contains('user') ? 'User' : 'Assistant';
        const content = msg.querySelector('.message-content')?.innerText;
        if (content && !content.includes('followup')) messages.push(`${sender}: ${content}`);
    });
    navigator.clipboard.writeText(messages.join('\n\n'));
    alert('Chat copied to clipboard!');
}

sendBtn.addEventListener('click', sendMessage);
clearChatBtn.addEventListener('click', clearChat);
if (downloadChatBtn) downloadChatBtn.addEventListener('click', downloadChat);
if (shareChatBtn) shareChatBtn.addEventListener('click', shareChat);

userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
userInput.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; });

loadIntents();
