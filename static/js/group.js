(() => {
    "use strict";

    const appData = window.APP_DATA;
    const socket = io({ transports: ["websocket", "polling"] });

    const messagesElement = document.getElementById("messages");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message-input");
    const chatError = document.getElementById("chat-error");
    const memberList = document.getElementById("member-list");
    const memberStories = document.getElementById("member-stories");
    const memberCount = document.getElementById("member-count");
    const onlineCount = document.getElementById("online-count");
    const currentUsername = document.getElementById("current-username");
    const currentUserAvatar = document.getElementById("current-user-avatar");
    const mobileProfileAvatar = document.getElementById("mobile-profile-avatar");
    const notificationButton = document.getElementById("notification-button");
    const mobileNotificationButton = document.getElementById("mobile-notification-button");
    const mobileCallButton = document.getElementById("mobile-call-button");
    const desktopUserSearch = document.getElementById("desktop-user-search");
    const mobileUserSearch = document.getElementById("mobile-user-search");
    const attachmentButton = document.getElementById("attachment-button");
    const attachmentMenu = document.getElementById("attachment-menu");
    const sendPictureButton = document.getElementById("send-picture-button");
    const sendVideoButton = document.getElementById("send-video-button");
    const sendLinkButton = document.getElementById("send-link-button");
    const pictureInput = document.getElementById("picture-input");
    const videoInput = document.getElementById("video-input");
    const uploadStatus = document.getElementById("upload-status");
    const uploadStatusText = document.getElementById("upload-status-text");
    const emojiButton = document.getElementById("emoji-button");
    const emojiPicker = document.getElementById("emoji-picker");
    const replyComposerBar = document.getElementById("reply-composer-bar");
    const replyComposerName = document.getElementById("reply-composer-name");
    const replyComposerText = document.getElementById("reply-composer-text");
    const cancelReplyButton = document.getElementById("cancel-reply-button");

    const activeCallBanner = document.getElementById("active-call-banner");
    const activeCallTitle = document.getElementById("active-call-title");
    const activeCallDetails = document.getElementById("active-call-details");
    const joinActiveCallButton = document.getElementById("join-active-call-button");

    const incomingCall = document.getElementById("incoming-call");
    const incomingCallIcon = document.getElementById("incoming-call-icon");
    const incomingCallTitle = document.getElementById("incoming-call-title");
    const incomingCallText = document.getElementById("incoming-call-text");
    const acceptCallButton = document.getElementById("accept-call-button");
    const declineCallButton = document.getElementById("decline-call-button");

    const callPanel = document.getElementById("call-panel");
    const callHeading = document.getElementById("call-heading");
    const videoGrid = document.getElementById("video-grid");
    const callStatus = document.getElementById("call-status");
    const voiceCallButton = document.getElementById("voice-call-button");
    const videoCallButton = document.getElementById("video-call-button");
    const muteButton = document.getElementById("mute-button");
    const cameraButton = document.getElementById("camera-button");
    const leaveCallButton = document.getElementById("leave-call-button");

    const peerConnections = new Map();
    const messageStore = new Map();
    const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉"];
    const composerEmojis = [
        "😀", "😂", "😊", "😍", "🥰", "😘", "😎", "🤔",
        "😭", "😢", "😡", "🤯", "😴", "🥳", "🤩", "😇",
        "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️",
        "❤️", "💙", "💚", "💜", "🖤", "💯", "🔥", "🎉",
        "✨", "🤣", "😅", "😮", "🤗", "🙄", "😜", "🤭"
    ];
    const peerNames = new Map();
    const pendingIce = new Map();
    let allMembers = Array.isArray(appData.members) ? appData.members : [];

    let onlineNames = new Set();
    let localStream = null;
    let inCall = false;
    let currentCallMode = null;
    let activeCall = null;
    let notificationRegistration = null;
    let unreadMessageCount = 0;
    let activeUserSearch = "";
    let replyingTo = null;
    const normalPageTitle = document.title;

    currentUsername.textContent = appData.username;
    currentUserAvatar.textContent = initials(appData.username);
    mobileProfileAvatar.textContent = initials(appData.username);

    function initials(username) {
        return username.slice(0, 2).toUpperCase();
    }

    function formatTime(isoTime) {
        const date = new Date(isoTime);
        return new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
        }).format(date);
    }

    function renderEmptyState() {
        if (messagesElement.children.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.id = "empty-state";
            empty.innerHTML = "<div><strong>Welcome to Kulot Friends</strong><span>Everyone registered with your invite code shares this conversation.</span></div>";
            messagesElement.appendChild(empty);
        }
    }

    function applyUserSearch(value) {
        const typedValue = String(value || "");
        activeUserSearch = typedValue.trim().toLocaleLowerCase();

        [desktopUserSearch, mobileUserSearch].forEach((input) => {
            if (input && input.value !== typedValue) {
                input.value = typedValue;
            }
        });

        document.getElementById("member-search-empty")?.remove();

        const memberItems = [...memberList.querySelectorAll(".member-item")];
        let matchCount = 0;

        memberItems.forEach((item) => {
            const username = String(item.dataset.username || "");
            const matches = !activeUserSearch || username.includes(activeUserSearch);
            item.hidden = !matches;
            if (matches) matchCount += 1;
        });

        memberStories.querySelectorAll(".story-person").forEach((story) => {
            const username = String(story.dataset.username || "");
            story.hidden = Boolean(activeUserSearch) && !username.includes(activeUserSearch);
        });

        memberCount.textContent = activeUserSearch
            ? `${matchCount}/${allMembers.length}`
            : String(allMembers.length);

        if (activeUserSearch && matchCount === 0) {
            const empty = document.createElement("li");
            empty.id = "member-search-empty";
            empty.className = "member-search-empty";
            empty.textContent = "No username found";
            memberList.appendChild(empty);
        }
    }

    function bindUserSearch(input) {
        if (!input) return;

        input.addEventListener("input", () => {
            applyUserSearch(input.value);
        });

        input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                input.value = "";
                applyUserSearch("");
                input.blur();
            }
        });
    }

    function appendRichText(container, text) {
        const value = String(text || "");
        const urlPattern = /https?:\/\/[^\s<]+/gi;
        let lastIndex = 0;

        for (const match of value.matchAll(urlPattern)) {
            const start = match.index ?? 0;
            if (start > lastIndex) {
                container.appendChild(document.createTextNode(value.slice(lastIndex, start)));
            }

            let urlText = match[0];
            let trailing = "";
            while (/[),.!?;:]$/.test(urlText)) {
                trailing = urlText.slice(-1) + trailing;
                urlText = urlText.slice(0, -1);
            }

            const link = document.createElement("a");
            link.className = "message-link";
            link.href = urlText;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = urlText;
            container.appendChild(link);

            if (trailing) container.appendChild(document.createTextNode(trailing));
            lastIndex = start + match[0].length;
        }

        if (lastIndex < value.length) {
            container.appendChild(document.createTextNode(value.slice(lastIndex)));
        }
    }

    function replySnippet(message) {
        const body = String(message?.body || "").trim();
        if (body) return body.length > 100 ? `${body.slice(0, 97)}...` : body;
        if (message?.message_type === "image") return "📷 Picture";
        if (message?.message_type === "video") return "🎬 Video";
        return "Message";
    }

    function setReply(message) {
        if (!message?.id) return;
        replyingTo = message;
        replyComposerName.textContent = message.username === appData.username
            ? "yourself"
            : message.username;
        replyComposerText.textContent = replySnippet(message);
        replyComposerBar.classList.remove("hidden");
        messageInput.focus();
    }

    function clearReply() {
        replyingTo = null;
        replyComposerBar.classList.add("hidden");
        replyComposerName.textContent = "";
        replyComposerText.textContent = "";
    }

    function closeMessageReactionPickers(except = null) {
        document.querySelectorAll(".message-reaction-picker").forEach((picker) => {
            if (picker !== except) picker.classList.add("hidden");
        });
    }

    function renderReactionSummary(article, message) {
        let summary = article.querySelector(".message-reactions");
        if (!summary) {
            summary = document.createElement("div");
            summary.className = "message-reactions";
            const content = article.querySelector(".message-content");
            const tools = content?.querySelector(".message-tools");
            if (content) content.insertBefore(summary, tools || null);
        }

        summary.replaceChildren();
        const reactions = Array.isArray(message.reactions) ? message.reactions : [];
        summary.classList.toggle("hidden", reactions.length === 0);

        reactions.forEach((reaction) => {
            const users = Array.isArray(reaction.users) ? reaction.users : [];
            const chip = document.createElement("button");
            chip.className = `reaction-chip${users.includes(appData.username) ? " active" : ""}`;
            chip.type = "button";
            chip.dataset.action = "toggle-reaction";
            chip.dataset.emoji = reaction.emoji;
            chip.title = users.join(", ") || "Reaction";
            chip.setAttribute("aria-label", `${reaction.emoji} reaction from ${users.join(", ")}`);

            const emoji = document.createElement("span");
            emoji.textContent = reaction.emoji;
            const count = document.createElement("small");
            count.textContent = String(reaction.count || users.length || 1);
            chip.append(emoji, count);
            summary.appendChild(chip);
        });
    }

    function createMessageTools(message) {
        const tools = document.createElement("div");
        tools.className = "message-tools";

        const replyButton = document.createElement("button");
        replyButton.type = "button";
        replyButton.className = "message-tool-button";
        replyButton.dataset.action = "reply";
        replyButton.title = "Reply";
        replyButton.setAttribute("aria-label", `Reply to ${message.username}`);
        replyButton.textContent = "↩";

        const reactButton = document.createElement("button");
        reactButton.type = "button";
        reactButton.className = "message-tool-button";
        reactButton.dataset.action = "open-reactions";
        reactButton.title = "React";
        reactButton.setAttribute("aria-label", "React to message");
        reactButton.textContent = "☺";

        const picker = document.createElement("div");
        picker.className = "message-reaction-picker hidden";
        picker.setAttribute("role", "menu");
        reactionEmojis.forEach((emoji) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "message-reaction-option";
            button.dataset.action = "toggle-reaction";
            button.dataset.emoji = emoji;
            button.setAttribute("role", "menuitem");
            button.setAttribute("aria-label", `React with ${emoji}`);
            button.textContent = emoji;
            picker.appendChild(button);
        });

        tools.append(replyButton, reactButton, picker);
        return tools;
    }

    function appendMessage(message) {
        document.getElementById("empty-state")?.remove();

        const messageId = Number(message.id);
        if (Number.isFinite(messageId)) {
            messageStore.set(messageId, message);
            document.getElementById(`message-${messageId}`)?.remove();
        }

        const article = document.createElement("article");
        article.className = `message${message.username === appData.username ? " own-message" : ""}`;
        if (Number.isFinite(messageId)) {
            article.id = `message-${messageId}`;
            article.dataset.messageId = String(messageId);
        }

        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = initials(message.username);

        const content = document.createElement("div");
        content.className = "message-content";
        const header = document.createElement("div");
        header.className = "message-header";

        const name = document.createElement("span");
        name.className = "message-name";
        name.textContent = message.username;

        const time = document.createElement("time");
        time.className = "message-time";
        time.dateTime = message.sent_at;
        time.textContent = formatTime(message.sent_at);

        header.append(name, time);
        content.appendChild(header);

        if (message.reply_to) {
            const replyPreview = document.createElement("button");
            replyPreview.type = "button";
            replyPreview.className = "message-reply-preview";
            replyPreview.dataset.action = "jump-to-message";
            replyPreview.dataset.targetMessageId = String(message.reply_to.id || "");

            const replyName = document.createElement("strong");
            replyName.textContent = message.reply_to.username || "Friend";
            const replyText = document.createElement("span");
            replyText.textContent = replySnippet(message.reply_to);
            replyPreview.append(replyName, replyText);
            content.appendChild(replyPreview);
        }

        const body = document.createElement("div");
        body.className = "message-body";

        const messageType = String(message.message_type || "text");
        const attachmentUrl = String(message.attachment_url || "");

        if (messageType === "image" && attachmentUrl) {
            body.classList.add("media-message");
            const mediaLink = document.createElement("a");
            mediaLink.className = "message-media-link";
            mediaLink.href = attachmentUrl;
            mediaLink.target = "_blank";
            mediaLink.rel = "noopener noreferrer";

            const image = document.createElement("img");
            image.className = "message-image";
            image.src = attachmentUrl;
            image.alt = message.attachment_name || `${message.username} sent a picture`;
            image.loading = "lazy";
            mediaLink.appendChild(image);
            body.appendChild(mediaLink);
        } else if (messageType === "video" && attachmentUrl) {
            body.classList.add("media-message");
            const video = document.createElement("video");
            video.className = "message-video";
            video.src = attachmentUrl;
            video.controls = true;
            video.playsInline = true;
            video.preload = "metadata";
            body.appendChild(video);
        }

        if (message.body) {
            const text = document.createElement("div");
            text.className = messageType === "text" ? "message-text" : "message-caption";
            appendRichText(text, message.body);
            body.appendChild(text);
        }

        content.append(body, createMessageTools(message));
        article.append(avatar, content);
        messagesElement.appendChild(article);
        renderReactionSummary(article, message);
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }

    function jumpToMessage(messageId) {
        const target = document.getElementById(`message-${messageId}`);
        if (!target) {
            chatError.textContent = "The replied message is outside the loaded history.";
            return;
        }
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.remove("message-highlight");
        void target.offsetWidth;
        target.classList.add("message-highlight");
        window.setTimeout(() => target.classList.remove("message-highlight"), 1400);
    }


    appData.messages.forEach(appendMessage);
    renderEmptyState();
    bindUserSearch(desktopUserSearch);
    bindUserSearch(mobileUserSearch);

    function setAttachmentMenu(open) {
        const shouldOpen = Boolean(open);
        attachmentMenu.classList.toggle("hidden", !shouldOpen);
        attachmentButton.setAttribute("aria-expanded", String(shouldOpen));
        attachmentButton.classList.toggle("active", shouldOpen);
    }

    function setUploadState(uploading, text = "Uploading…") {
        uploadStatus.classList.toggle("hidden", !uploading);
        uploadStatusText.textContent = text;
        attachmentButton.disabled = uploading;
        sendPictureButton.disabled = uploading;
        sendVideoButton.disabled = uploading;
        sendLinkButton.disabled = uploading;
    }

    function normalizeLink(value) {
        let candidate = String(value || "").trim();
        if (!candidate) return null;
        if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
        try {
            const parsed = new URL(candidate);
            return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
        } catch {
            return null;
        }
    }

    async function uploadAttachment(file) {
        if (!file) return;

        const maximumBytes = Number(appData.maxUploadMb || 25) * 1024 * 1024;
        if (file.size > maximumBytes) {
            chatError.textContent = `The file is too large. Maximum size is ${appData.maxUploadMb || 25} MB.`;
            return;
        }

        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) {
            chatError.textContent = "Choose a supported picture or video file.";
            return;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("caption", messageInput.value.trim());
        if (replyingTo?.id) formData.append("reply_to_id", String(replyingTo.id));

        setAttachmentMenu(false);
        setUploadState(true, isImage ? "Sending picture…" : "Sending video…");
        chatError.textContent = "";

        try {
            const response = await fetch("/api/messages/upload", {
                method: "POST",
                headers: {
                    "X-CSRF-Token": appData.csrfToken,
                },
                body: formData,
            });

            let result = {};
            try {
                result = await response.json();
            } catch {
                result = {};
            }

            if (!response.ok) {
                throw new Error(result.error || `Upload failed (${response.status}).`);
            }

            messageInput.value = "";
            messageInput.style.height = "auto";
            clearReply();
            messageInput.focus();
        } catch (error) {
            console.error("Attachment upload failed", error);
            chatError.textContent = error.message || "Could not send the file.";
        } finally {
            setUploadState(false);
            pictureInput.value = "";
            videoInput.value = "";
        }
    }

    attachmentButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setEmojiPicker(false);
        closeMessageReactionPickers();
        setAttachmentMenu(attachmentMenu.classList.contains("hidden"));
    });

    attachmentMenu.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", () => {
        setAttachmentMenu(false);
        setEmojiPicker(false);
        closeMessageReactionPickers();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setAttachmentMenu(false);
            setEmojiPicker(false);
            closeMessageReactionPickers();
            if (replyingTo) clearReply();
        }
    });

    sendPictureButton.addEventListener("click", () => pictureInput.click());
    sendVideoButton.addEventListener("click", () => videoInput.click());
    pictureInput.addEventListener("change", () => uploadAttachment(pictureInput.files?.[0]));
    videoInput.addEventListener("change", () => uploadAttachment(videoInput.files?.[0]));

    sendLinkButton.addEventListener("click", () => {
        setAttachmentMenu(false);
        const entered = window.prompt("Paste the website link:", "https://");
        if (entered === null) return;
        const normalized = normalizeLink(entered);
        if (!normalized) {
            chatError.textContent = "Enter a valid website link.";
            return;
        }
        const existingText = messageInput.value.trim();
        messageInput.value = existingText ? `${existingText} ${normalized}` : normalized;
        messageInput.dispatchEvent(new Event("input"));
        messageInput.focus();
    });

    function setEmojiPicker(open) {
        const shouldOpen = Boolean(open);
        emojiPicker.classList.toggle("hidden", !shouldOpen);
        emojiButton.setAttribute("aria-expanded", String(shouldOpen));
        emojiButton.classList.toggle("active", shouldOpen);
    }

    function insertEmoji(emoji) {
        const start = messageInput.selectionStart ?? messageInput.value.length;
        const end = messageInput.selectionEnd ?? messageInput.value.length;
        messageInput.setRangeText(emoji, start, end, "end");
        messageInput.dispatchEvent(new Event("input"));
        messageInput.focus();
    }

    composerEmojis.forEach((emoji) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "composer-emoji-option";
        button.dataset.emoji = emoji;
        button.setAttribute("role", "menuitem");
        button.setAttribute("aria-label", `Insert ${emoji}`);
        button.textContent = emoji;
        emojiPicker.appendChild(button);
    });

    emojiButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setAttachmentMenu(false);
        closeMessageReactionPickers();
        setEmojiPicker(emojiPicker.classList.contains("hidden"));
    });

    emojiPicker.addEventListener("click", (event) => {
        event.stopPropagation();
        const button = event.target.closest("button[data-emoji]");
        if (!button) return;
        insertEmoji(button.dataset.emoji || "");
    });

    cancelReplyButton.addEventListener("click", clearReply);

    messagesElement.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const article = button.closest(".message");
        const messageId = Number(article?.dataset.messageId || 0);
        const action = button.dataset.action;

        if (action === "reply") {
            const message = messageStore.get(messageId);
            if (message) setReply(message);
            closeMessageReactionPickers();
            return;
        }

        if (action === "open-reactions") {
            event.stopPropagation();
            setAttachmentMenu(false);
            setEmojiPicker(false);
            const picker = article?.querySelector(".message-reaction-picker");
            const shouldOpen = Boolean(picker?.classList.contains("hidden"));
            closeMessageReactionPickers();
            picker?.classList.toggle("hidden", !shouldOpen);
            return;
        }

        if (action === "toggle-reaction") {
            event.stopPropagation();
            const emoji = button.dataset.emoji || "";
            if (messageId && reactionEmojis.includes(emoji)) {
                socket.emit("toggle_reaction", { message_id: messageId, emoji });
            }
            closeMessageReactionPickers();
            return;
        }

        if (action === "jump-to-message") {
            jumpToMessage(Number(button.dataset.targetMessageId || 0));
        }
    });

    messageInput.addEventListener("input", () => {
        messageInput.style.height = "auto";
        messageInput.style.height = `${Math.min(messageInput.scrollHeight, 140)}px`;
    });

    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            messageForm.requestSubmit();
        }
    });

    messageForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const body = messageInput.value.trim();
        if (!body) return;
        socket.emit("send_message", {
            body,
            reply_to_id: replyingTo?.id || null,
        });
        messageInput.value = "";
        messageInput.style.height = "auto";
        clearReply();
        setEmojiPicker(false);
        chatError.textContent = "";
        messageInput.focus();
    });

    function updateUnreadTitle() {
        document.title = unreadMessageCount > 0
            ? `(${unreadMessageCount}) ${normalPageTitle}`
            : normalPageTitle;
    }

    function updateNotificationButtons() {
        const supported = "Notification" in window && "serviceWorker" in navigator;
        [notificationButton, mobileNotificationButton].forEach((button) => {
            if (!button) return;
            if (!supported) {
                button.disabled = true;
                button.title = "Notifications are not supported in this browser";
                return;
            }
            if (Notification.permission === "granted") {
                button.title = "Message notifications enabled";
                button.setAttribute("aria-label", "Message notifications enabled");
            } else if (Notification.permission === "denied") {
                button.title = "Notifications are blocked in browser settings";
                button.setAttribute("aria-label", "Notifications blocked");
            } else {
                button.title = "Enable message notifications";
                button.setAttribute("aria-label", "Enable message notifications");
            }
        });
    }

    async function registerNotificationWorker() {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) {
            updateNotificationButtons();
            return;
        }
        try {
            notificationRegistration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        } catch (error) {
            console.error("Service worker registration failed:", error);
        }
        updateNotificationButtons();
    }

    async function enableNotifications() {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) {
            alert("This browser does not support website notifications.");
            return;
        }
        if (Notification.permission === "denied") {
            alert("Notifications are blocked. Open this website's browser settings and change Notifications to Allow.");
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            updateNotificationButtons();
            if (permission !== "granted") return;
            notificationRegistration = notificationRegistration || await navigator.serviceWorker.ready;
            await notificationRegistration.showNotification("Kulot Friends", {
                body: "Message notifications are enabled.",
                tag: "notifications-enabled",
                icon: "/static/icon-192.png",
                data: { url: "/chat" },
            });
        } catch (error) {
            console.error("Could not enable notifications:", error);
        }
    }

    async function showMessageNotification(message) {
        if (!("Notification" in window) || message.username === appData.username || Notification.permission !== "granted") return;
        if (document.visibilityState === "visible" && document.hasFocus()) return;
        const registration = notificationRegistration || await navigator.serviceWorker.ready;
        const fullMessage = String(message.body || "");
        const fallback = message.message_type === "image"
            ? "Sent a picture"
            : message.message_type === "video"
                ? "Sent a video"
                : "Sent a message";
        const notificationText = fullMessage || fallback;
        const preview = notificationText.length > 120 ? `${notificationText.slice(0, 117)}...` : notificationText;
        await registration.showNotification(`${message.username} · Kulot Friends`, {
            body: preview,
            tag: `message-${message.id}`,
            data: { url: "/chat" },
            vibrate: [180, 80, 180],
        });
    }

    socket.on("new_message", (message) => {
        appendMessage(message);
        if (message.username !== appData.username && (document.hidden || !document.hasFocus())) {
            unreadMessageCount += 1;
            updateUnreadTitle();
            showMessageNotification(message).catch((error) => {
                console.error("Notification failed:", error);
            });
        }
    });

    socket.on("reaction_updated", (payload) => {
        const messageId = Number(payload?.message_id || 0);
        const message = messageStore.get(messageId);
        const article = document.getElementById(`message-${messageId}`);
        if (!message || !article) return;
        message.reactions = Array.isArray(payload?.reactions) ? payload.reactions : [];
        renderReactionSummary(article, message);
    });

    socket.on("chat_error", (payload) => {
        chatError.textContent = payload?.message || "Could not send the message.";
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            unreadMessageCount = 0;
            updateUnreadTitle();
        }
    });
    window.addEventListener("focus", () => {
        unreadMessageCount = 0;
        updateUnreadTitle();
    });
    notificationButton?.addEventListener("click", enableNotifications);
    mobileNotificationButton?.addEventListener("click", enableNotifications);
    registerNotificationWorker();

    function renderMembers() {
        memberList.replaceChildren();
        memberStories.replaceChildren();
        memberCount.textContent = String(allMembers.length);
        onlineCount.textContent = String(onlineNames.size);

        const orderedMembers = [...allMembers].sort((a, b) => {
            const onlineDifference = Number(onlineNames.has(b)) - Number(onlineNames.has(a));
            return onlineDifference || a.localeCompare(b);
        });

        orderedMembers.forEach((username) => {
            const online = onlineNames.has(username);
            const item = document.createElement("li");
            item.className = `member-item${online ? "" : " offline"}`;
            item.dataset.username = username.toLocaleLowerCase();

            const avatar = document.createElement("span");
            avatar.className = "avatar";
            avatar.textContent = initials(username);

            const details = document.createElement("span");
            details.className = "member-details";

            const name = document.createElement("strong");
            name.textContent = username === appData.username ? `${username} (you)` : username;

            const status = document.createElement("small");
            status.textContent = online ? "Active now" : "Offline";

            details.append(name, status);
            item.append(avatar, details);
            memberList.appendChild(item);

            const story = document.createElement("div");
            story.className = `story-person${online ? "" : " offline"}`;
            story.dataset.username = username.toLocaleLowerCase();
            const storyWrap = document.createElement("div");
            storyWrap.className = "story-avatar-wrap";
            const storyAvatar = document.createElement("span");
            storyAvatar.className = "story-avatar";
            storyAvatar.textContent = initials(username);
            const storyOnline = document.createElement("span");
            storyOnline.className = "story-online";
            const storyName = document.createElement("small");
            storyName.textContent = username === appData.username ? "You" : username;
            storyWrap.append(storyAvatar, storyOnline);
            story.append(storyWrap, storyName);
            memberStories.appendChild(story);
        });

        applyUserSearch(activeUserSearch);
    }

    socket.on("online_users", (payload) => {
        const users = Array.isArray(payload?.users) ? payload.users : [];
        if (Array.isArray(payload?.members)) allMembers = payload.members;
        onlineNames = new Set(users);
        renderMembers();
    });

    renderMembers();

    function createVideoTile(id, username, stream, isLocal = false) {
        document.getElementById(`video-${id}`)?.remove();

        const tile = document.createElement("div");
        tile.className = `video-tile${isLocal ? " local" : ""}`;
        tile.id = `video-${id}`;

        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = isLocal;
        video.srcObject = stream;

        const label = document.createElement("span");
        label.className = "video-label";
        label.textContent = isLocal ? `${username} (you)` : username;

        tile.append(video, label);
        videoGrid.appendChild(tile);
        return tile;
    }

    function updateLocalVideoState() {
        const tile = document.getElementById("video-local");
        if (!tile || !localStream) return;
        const videoTrack = localStream.getVideoTracks()[0];
        tile.classList.toggle("audio-only", !videoTrack || !videoTrack.enabled);
    }

    function createPeerConnection(peerSid, username) {
        const existing = peerConnections.get(peerSid);
        if (existing) return existing;

        peerNames.set(peerSid, username || "Friend");
        const connection = new RTCPeerConnection({ iceServers: appData.iceServers });
        peerConnections.set(peerSid, connection);

        if (localStream) {
            localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
        }

        connection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("webrtc_ice", {
                    target: peerSid,
                    data: event.candidate.toJSON(),
                });
            }
        };

        connection.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track]);
            const tile = createVideoTile(peerSid, peerNames.get(peerSid) || "Friend", stream);
            const refreshAudioOnlyState = () => {
                const tracks = stream.getVideoTracks();
                tile.classList.toggle("audio-only", tracks.length === 0 || tracks.every((track) => track.muted));
            };
            refreshAudioOnlyState();
            event.track.addEventListener("mute", refreshAudioOnlyState);
            event.track.addEventListener("unmute", refreshAudioOnlyState);
        };

        connection.onconnectionstatechange = () => {
            if (["failed", "closed"].includes(connection.connectionState)) {
                removePeer(peerSid);
            }
        };

        return connection;
    }

    async function flushPendingIce(peerSid) {
        const connection = peerConnections.get(peerSid);
        if (!connection?.remoteDescription) return;
        const candidates = pendingIce.get(peerSid) || [];
        pendingIce.delete(peerSid);
        for (const candidate of candidates) {
            try {
                await connection.addIceCandidate(candidate);
            } catch (error) {
                console.warn("Could not add queued ICE candidate", error);
            }
        }
    }

    async function makeOffer(peerSid, username) {
        const connection = createPeerConnection(peerSid, username);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        socket.emit("webrtc_offer", {
            target: peerSid,
            data: connection.localDescription,
        });
    }

    socket.on("call_peers", async (payload) => {
        const peers = Array.isArray(payload?.peers) ? payload.peers : [];
        callStatus.textContent = peers.length ? `Connected with ${peers.length} friend(s)` : "Waiting for friends to answer…";
        for (const peer of peers) {
            try {
                await makeOffer(peer.sid, peer.username);
            } catch (error) {
                console.error("Offer failed", error);
            }
        }
    });

    socket.on("peer_joined", (payload) => {
        if (!inCall) return;
        peerNames.set(payload.sid, payload.username || "Friend");
        callStatus.textContent = `${payload.username || "A friend"} joined`;
    });

    socket.on("webrtc_offer", async (payload) => {
        if (!inCall) return;
        try {
            const connection = createPeerConnection(payload.from, payload.username);
            await connection.setRemoteDescription(payload.data);
            await flushPendingIce(payload.from);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            socket.emit("webrtc_answer", {
                target: payload.from,
                data: connection.localDescription,
            });
        } catch (error) {
            console.error("Could not answer call", error);
        }
    });

    socket.on("webrtc_answer", async (payload) => {
        const connection = peerConnections.get(payload.from);
        if (!connection) return;
        try {
            await connection.setRemoteDescription(payload.data);
            await flushPendingIce(payload.from);
        } catch (error) {
            console.error("Could not apply answer", error);
        }
    });

    socket.on("webrtc_ice", async (payload) => {
        const candidate = new RTCIceCandidate(payload.data);
        const connection = peerConnections.get(payload.from);
        if (!connection || !connection.remoteDescription) {
            const queue = pendingIce.get(payload.from) || [];
            queue.push(candidate);
            pendingIce.set(payload.from, queue);
            return;
        }
        try {
            await connection.addIceCandidate(candidate);
        } catch (error) {
            console.warn("Could not add ICE candidate", error);
        }
    });

    function removePeer(peerSid) {
        const connection = peerConnections.get(peerSid);
        if (connection) {
            connection.ontrack = null;
            connection.onicecandidate = null;
            connection.close();
        }
        peerConnections.delete(peerSid);
        peerNames.delete(peerSid);
        pendingIce.delete(peerSid);
        document.getElementById(`video-${peerSid}`)?.remove();
    }

    socket.on("peer_left", (payload) => {
        removePeer(payload.sid);
        callStatus.textContent = `${payload.username || "A friend"} left`;
    });

    function showIncomingCall(call) {
        if (!call || inCall || call.started_by === appData.username) return;
        const isVideo = call.mode === "video";
        incomingCallIcon.textContent = isVideo ? "📹" : "☎";
        incomingCallTitle.textContent = isVideo ? "Incoming group video call" : "Incoming group voice call";
        incomingCallText.textContent = `${call.started_by} is calling Kulot Friends`;
        incomingCall.classList.remove("hidden");
    }

    function hideIncomingCall() {
        incomingCall.classList.add("hidden");
    }

    function updateCallUI() {
        const callExists = Boolean(activeCall);
        voiceCallButton.disabled = callExists || inCall;
        videoCallButton.disabled = callExists || inCall;

        if (callExists && !inCall) {
            const isVideo = activeCall.mode === "video";
            activeCallTitle.textContent = isVideo ? "Group video call in progress" : "Group voice call in progress";
            const count = Number(activeCall.participant_count || 0);
            activeCallDetails.textContent = `Started by ${activeCall.started_by} · ${count} participant${count === 1 ? "" : "s"}`;
            joinActiveCallButton.textContent = isVideo ? "Join video call" : "Join voice call";
            activeCallBanner.classList.remove("hidden");
        } else {
            activeCallBanner.classList.add("hidden");
        }

        if (inCall) {
            callHeading.textContent = currentCallMode === "video" ? "Group video call" : "Group voice call";
        }
    }

    function setActiveCall(call) {
        activeCall = call || null;
        updateCallUI();
    }

    async function getLocalMedia(mode) {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Camera and microphone require HTTPS, or localhost during development.");
        }
        return navigator.mediaDevices.getUserMedia({
            audio: true,
            video: mode === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
    }

    async function openLocalCall(mode) {
        localStream = await getLocalMedia(mode);
        inCall = true;
        currentCallMode = mode;
        hideIncomingCall();
        callPanel.classList.remove("hidden");
        cameraButton.disabled = mode !== "video";
        cameraButton.textContent = mode === "video" ? "Camera off" : "No camera";
        muteButton.textContent = "Mute";
        callStatus.textContent = "Connecting…";
        createVideoTile("local", appData.username, localStream, true);
        updateLocalVideoState();
        updateCallUI();
    }

    async function startGroupCall(mode) {
        if (inCall) return;
        if (activeCall) {
            await joinExistingCall();
            return;
        }

        try {
            await openLocalCall(mode);
            socket.emit("start_group_call", { mode });
        } catch (error) {
            console.error(error);
            alert(error.message || "Microphone/camera permission was denied or no device is available.");
            cleanupLocalCall(false);
        }
    }

    async function joinExistingCall() {
        if (inCall || !activeCall) return;
        try {
            await openLocalCall(activeCall.mode);
            socket.emit("join_call");
        } catch (error) {
            console.error(error);
            alert(error.message || "Microphone/camera permission was denied or no device is available.");
            cleanupLocalCall(false);
        }
    }

    function cleanupLocalCall(notifyServer = true) {
        if (notifyServer && inCall) socket.emit("leave_call");
        peerConnections.forEach((_, sid) => removePeer(sid));
        localStream?.getTracks().forEach((track) => track.stop());
        localStream = null;
        inCall = false;
        currentCallMode = null;
        videoGrid.replaceChildren();
        callPanel.classList.add("hidden");
        updateCallUI();
    }

    voiceCallButton.addEventListener("click", () => startGroupCall("audio"));
    videoCallButton.addEventListener("click", () => startGroupCall("video"));
    mobileCallButton?.addEventListener("click", () => startGroupCall("video"));
    joinActiveCallButton.addEventListener("click", joinExistingCall);
    acceptCallButton.addEventListener("click", joinExistingCall);
    declineCallButton.addEventListener("click", hideIncomingCall);
    leaveCallButton.addEventListener("click", () => cleanupLocalCall(true));

    muteButton.addEventListener("click", () => {
        const audioTrack = localStream?.getAudioTracks()[0];
        if (!audioTrack) return;
        audioTrack.enabled = !audioTrack.enabled;
        muteButton.textContent = audioTrack.enabled ? "Mute" : "Unmute";
    });

    cameraButton.addEventListener("click", () => {
        if (currentCallMode !== "video") return;
        const videoTrack = localStream?.getVideoTracks()[0];
        if (!videoTrack) return;
        videoTrack.enabled = !videoTrack.enabled;
        cameraButton.textContent = videoTrack.enabled ? "Camera off" : "Camera on";
        updateLocalVideoState();
    });

    socket.on("call_state", (payload) => {
        setActiveCall(payload?.call || null);
    });

    socket.on("call_started", (payload) => {
        const call = payload?.call || null;
        setActiveCall(call);
        showIncomingCall(call);
    });

    socket.on("call_already_active", (payload) => {
        cleanupLocalCall(false);
        setActiveCall(payload?.call || null);
        showIncomingCall(activeCall);
    });

    socket.on("call_start_error", (payload) => {
        cleanupLocalCall(false);
        setActiveCall(null);
        alert(payload?.message || "The call could not be joined.");
    });

    socket.on("call_ended", () => {
        hideIncomingCall();
        setActiveCall(null);
        if (inCall) cleanupLocalCall(false);
    });

    window.addEventListener("beforeunload", () => {
        if (inCall) socket.emit("leave_call");
    });
})();
