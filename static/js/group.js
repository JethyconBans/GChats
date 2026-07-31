(() => {
    "use strict";

    const appData = window.APP_DATA;
    const socket = io({ transports: ["websocket", "polling"] });

    const messagesElement = document.getElementById("messages");
    const historyStatus = document.getElementById("history-status");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message-input");
    const chatError = document.getElementById("chat-error");
    const memberList = document.getElementById("member-list");
    const memberStories = document.getElementById("member-stories");
    const memberCount = document.getElementById("member-count");
    const conversationStatus = document.getElementById("conversation-status");
    const currentUsername = document.getElementById("current-username");
    const currentUserAvatar = document.getElementById("current-user-avatar");
    const mobileProfileAvatar = document.getElementById("mobile-profile-avatar");
    const notificationButton = document.getElementById("notification-button");
    const mobileNotificationButton = document.getElementById("mobile-notification-button");
    const mobileCallButton = document.getElementById("mobile-call-button");
    const desktopUserSearch = document.getElementById("desktop-chat-search");
    const mobileUserSearch = document.getElementById("mobile-chat-search");
    const desktopConversationList = document.getElementById("desktop-conversation-list");
    const mobileConversationList = document.getElementById("mobile-conversation-list");
    const newGroupModal = document.getElementById("new-group-modal");
    const openGroupModalButton = document.getElementById("open-group-modal");
    const mobileOpenGroupModalButton = document.getElementById("mobile-open-group-modal");
    const desktopAppMenuButton = document.getElementById("desktop-app-menu-button");
    const mobileAppMenuButton = document.getElementById("mobile-app-menu-button");
    const appMenuOverlay = document.getElementById("app-menu-overlay");
    const appMenuPanel = document.getElementById("app-menu-panel");
    const closeAppMenuButton = document.getElementById("close-app-menu");
    const menuCreateGroupButton = document.getElementById("menu-create-group");
    const menuSettingsToggle = document.getElementById("menu-settings-toggle");
    const menuSettingsSection = document.getElementById("menu-settings-section");
    const settingsChevron = document.getElementById("settings-chevron");
    const themeChoiceButtons = [...document.querySelectorAll("[data-theme-choice]")];
    const closeGroupModalButton = document.getElementById("close-group-modal");
    const groupNameInput = document.getElementById("group-name-input");
    const groupMemberOptions = document.getElementById("group-member-options");
    const groupMemberSearch = document.getElementById("group-member-search");
    const groupSelectedCount = document.getElementById("group-selected-count");
    const createGroupButton = document.getElementById("create-group-button");
    const groupCreateStatus = document.getElementById("group-create-status");
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

    const profileModal = document.getElementById("profile-modal");
    const closeProfileModalButton = document.getElementById("close-profile-modal");
    const profileModalAvatar = document.getElementById("profile-modal-avatar");
    const profileModalUsername = document.getElementById("profile-modal-username");
    const profilePictureLimit = document.getElementById("profile-picture-limit");
    const chooseProfilePictureButton = document.getElementById("choose-profile-picture");
    const removeProfilePictureButton = document.getElementById("remove-profile-picture");
    const profilePictureInput = document.getElementById("profile-picture-input");
    const profileNoteInput = document.getElementById("profile-note-input");
    const profileNoteCount = document.getElementById("profile-note-count");
    const saveProfileNoteButton = document.getElementById("save-profile-note");
    const clearProfileNoteButton = document.getElementById("clear-profile-note");
    const profileStatus = document.getElementById("profile-status");
    const profileBioInput = document.getElementById("profile-bio-input");
    const profileBioCount = document.getElementById("profile-bio-count");
    const saveProfileBioButton = document.getElementById("save-profile-bio");
    const clearProfileBioButton = document.getElementById("clear-profile-bio");

    const userProfileModal = document.getElementById("user-profile-modal");
    const backUserProfileButton = document.getElementById("back-user-profile");
    const userProfilePicture = document.getElementById("user-profile-picture");
    const userProfileName = document.getElementById("user-profile-name");
    const userProfilePresence = document.getElementById("user-profile-presence");
    const userProfileNote = document.getElementById("user-profile-note");
    const userProfileBio = document.getElementById("user-profile-bio");
    const userProfileMessageButton = document.getElementById("user-profile-message-button");

    const mediaViewerModal = document.getElementById("media-viewer-modal");
    const mediaViewerBack = document.getElementById("media-viewer-back");
    const mediaViewerTitle = document.getElementById("media-viewer-title");
    const mediaViewerSubtitle = document.getElementById("media-viewer-subtitle");
    const mediaViewerDownload = document.getElementById("media-viewer-download");
    const mediaViewerStage = document.getElementById("media-viewer-stage");

    const editGroupButton = document.getElementById("edit-group-button");
    const conversationAvatar = document.getElementById("conversation-avatar");
    const conversationNameElement = document.getElementById("conversation-name");
    const groupProfileModal = document.getElementById("group-profile-modal");
    const closeGroupProfileModalButton = document.getElementById("close-group-profile-modal");
    const groupProfileAvatar = document.getElementById("group-profile-avatar");
    const groupPictureLimit = document.getElementById("group-picture-limit");
    const chooseGroupPictureButton = document.getElementById("choose-group-picture");
    const removeGroupPictureButton = document.getElementById("remove-group-picture");
    const groupPictureInput = document.getElementById("group-picture-input");
    const editGroupNameInput = document.getElementById("edit-group-name-input");
    const editGroupNameCount = document.getElementById("edit-group-name-count");
    const groupProfileStatus = document.getElementById("group-profile-status");
    const saveGroupProfileButton = document.getElementById("save-group-profile");
    const groupOptionsButton = document.getElementById("group-options-button");
    const groupOptionsMenu = document.getElementById("group-options-menu");
    const viewGroupMembersButton = document.getElementById("view-group-members-button");
    const leaveGroupButton = document.getElementById("leave-group-button");
    const groupMembersModal = document.getElementById("group-members-modal");
    const backGroupMembersButton = document.getElementById("back-group-members");
    const groupMembersList = document.getElementById("group-members-list");
    const groupMembersSummary = document.getElementById("group-members-summary");
    const groupOptionsMemberCount = document.getElementById("group-options-member-count");
    const leaveGroupModal = document.getElementById("leave-group-modal");
    const closeLeaveGroupModalButton = document.getElementById("close-leave-group-modal");
    const cancelLeaveGroupButton = document.getElementById("cancel-leave-group");
    const confirmLeaveGroupButton = document.getElementById("confirm-leave-group");
    const leaveGroupStatus = document.getElementById("leave-group-status");

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
    const conversationId = Number(appData.selectedConversation?.id || 0);
    let conversationName = String(appData.selectedConversation?.name || "GChats");

    function normalizeMember(member) {
        if (typeof member === "string") {
            return {
                id: 0,
                username: member,
                profile_picture_url: null,
                note: "",
                note_expires_at: null,
                bio: "",
                last_seen_at: null,
            };
        }
        return {
            id: Number(member?.id || 0),
            username: String(member?.username || ""),
            profile_picture_url: member?.profile_picture_url || null,
            note: String(member?.note || ""),
            note_expires_at: member?.note_expires_at || null,
            bio: String(member?.bio || ""),
            last_seen_at: member?.last_seen_at || null,
        };
    }

    let allMembers = Array.isArray(appData.members)
        ? appData.members.map(normalizeMember).filter((member) => member.username)
        : [];
    let currentProfile = normalizeMember(
        appData.currentProfile || allMembers.find((member) => member.username === appData.username) || appData.username
    );
    let selectedConversationMembers = (appData.selectedConversation?.members || [])
        .map(normalizeMember)
        .filter((member) => member.username);
    const selectedMemberNames = new Set(
        selectedConversationMembers.map((member) => member.username)
    );

    let onlineNames = new Set();
    let localStream = null;
    let inCall = false;
    let currentCallMode = null;
    let activeCall = null;
    let notificationRegistration = null;
    let unreadMessageCount = 0;
    let activeUserSearch = "";
    let replyingTo = null;
    let pendingGroupPictureFile = null;
    let removeGroupPictureRequested = false;
    let groupPicturePreviewUrl = null;
    let viewedProfileUsername = "";
    const historyPageSize = Math.max(20, Number(appData.historyPageSize) || 50);
    let historyLoading = false;
    let historyHasMore = Array.isArray(appData.messages) && appData.messages.length >= historyPageSize;
    let oldestMessageId = Array.isArray(appData.messages) && appData.messages.length
        ? Math.min(...appData.messages.map((message) => Number(message.id)).filter(Number.isFinite))
        : null;
    const normalPageTitle = document.title;

    if (currentUsername) currentUsername.textContent = appData.username;

    function initials(username) {
        return String(username || "?").slice(0, 2).toUpperCase();
    }

    function setAvatar(element, username, pictureUrl) {
        if (!element) return;
        const url = String(pictureUrl || "").trim();
        element.textContent = url ? "" : initials(username);
        element.classList.toggle("has-profile-photo", Boolean(url));
        element.style.backgroundImage = url ? `url("${url.replaceAll('"', '%22')}")` : "";
        element.setAttribute("aria-label", `${username} profile picture`);
    }

    function memberFor(username) {
        const wanted = String(username || "").toLocaleLowerCase();
        return allMembers.find((member) => member.username.toLocaleLowerCase() === wanted) || null;
    }

    function activeNote(member) {
        const note = String(member?.note || "").trim();
        if (!note) return "";
        if (!member?.note_expires_at) return note;
        const expires = new Date(member.note_expires_at).getTime();
        return Number.isFinite(expires) && expires > Date.now() ? note : "";
    }

    function memberIsOnline(username) {
        return onlineNames.has(String(username || ""));
    }

    function offlineTimeText(member) {
        const seenAt = String(member?.last_seen_at || "").trim();
        if (!seenAt) return "Offline";

        const seen = new Date(seenAt);
        const seenTime = seen.getTime();
        if (!Number.isFinite(seenTime)) return "Offline";

        const now = Date.now();
        const elapsed = Math.max(0, now - seenTime);
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;

        if (elapsed < minute) return "Offline · just now";
        if (elapsed < hour) return `Offline · ${Math.max(1, Math.floor(elapsed / minute))}m ago`;
        if (elapsed < day) return `Offline · ${Math.floor(elapsed / hour)}h ago`;

        const time = new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
        }).format(seen);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (seen.toDateString() === yesterday.toDateString()) {
            return `Offline · yesterday at ${time}`;
        }
        if (elapsed < 7 * day) {
            const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(seen);
            return `Offline · ${weekday} at ${time}`;
        }

        const date = new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            year: seen.getFullYear() === today.getFullYear() ? undefined : "numeric",
        }).format(seen);
        return `Offline · ${date}`;
    }

    function presenceText(member) {
        return memberIsOnline(member?.username) ? "Active now" : offlineTimeText(member);
    }

    function closeMediaViewer() {
        if (!mediaViewerModal) return;
        mediaViewerModal.classList.add("hidden");
        mediaViewerStage?.replaceChildren();
        if (mediaViewerDownload) {
            mediaViewerDownload.href = "#";
            mediaViewerDownload.classList.add("hidden");
        }
        document.body.classList.remove("media-viewer-open");
    }

    function openMediaViewer({ url, type = "image", title = "Picture", subtitle = "", downloadUrl = "", alt = "Picture" }) {
        if (!mediaViewerModal || !mediaViewerStage || !url) return;
        mediaViewerStage.replaceChildren();

        if (type === "video") {
            const video = document.createElement("video");
            video.src = url;
            video.controls = true;
            video.autoplay = true;
            video.playsInline = true;
            video.className = "media-viewer-video";
            mediaViewerStage.appendChild(video);
        } else {
            const image = document.createElement("img");
            image.src = url;
            image.alt = alt;
            image.className = "media-viewer-image";
            mediaViewerStage.appendChild(image);
        }

        if (mediaViewerTitle) mediaViewerTitle.textContent = title;
        if (mediaViewerSubtitle) mediaViewerSubtitle.textContent = subtitle;
        if (mediaViewerDownload) {
            mediaViewerDownload.href = downloadUrl || url;
            mediaViewerDownload.classList.toggle("hidden", !downloadUrl);
        }
        mediaViewerModal.classList.remove("hidden");
        document.body.classList.add("media-viewer-open");
    }

    function closeUserProfile() {
        if (!userProfileModal) return;
        userProfileModal.classList.add("hidden");
        viewedProfileUsername = "";
        document.body.classList.remove("modal-open");
    }

    function refreshViewedUserProfile() {
        if (!viewedProfileUsername || !userProfileModal) return;
        const member = memberFor(viewedProfileUsername);
        if (!member) return;

        setAvatar(userProfilePicture, member.username, member.profile_picture_url);
        if (userProfileName) userProfileName.textContent = member.username;
        if (userProfilePresence) userProfilePresence.textContent = presenceText(member);
        if (userProfileBio) userProfileBio.textContent = member.bio || "No bio yet.";
        const note = activeNote(member);
        if (userProfileNote) {
            userProfileNote.textContent = note;
            userProfileNote.classList.toggle("hidden", !note);
        }
        if (userProfileMessageButton) {
            const isOwn = member.username.toLocaleLowerCase() === appData.username.toLocaleLowerCase();
            userProfileMessageButton.textContent = isOwn ? "Edit profile" : "Message";
        }
    }

    function openUserProfile(username) {
        const member = memberFor(username);
        if (!member || !userProfileModal) return;
        viewedProfileUsername = member.username;
        refreshViewedUserProfile();
        userProfileModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    }

    function selectedDirectMember() {
        if (appData.selectedConversation?.type !== "direct") return null;
        const initial = selectedConversationMembers.find(
            (member) => member.username.toLocaleLowerCase() !== appData.username.toLocaleLowerCase()
        );
        return initial ? (memberFor(initial.username) || initial) : null;
    }

    function refreshConversationListPresence() {
        (appData.conversations || []).forEach((conversation) => {
            if (conversation.type !== "direct") return;
            const rawOther = (conversation.members || []).find(
                (member) => String(member.username || "").toLocaleLowerCase() !== appData.username.toLocaleLowerCase()
            );
            if (!rawOther) return;
            const other = memberFor(rawOther.username) || normalizeMember(rawOther);
            const online = memberIsOnline(other.username);
            document.querySelectorAll(`[data-conversation-id="${Number(conversation.id)}"]`).forEach((row) => {
                const avatar = row.querySelector(".conversation-card-avatar, .mobile-conversation-avatar");
                if (!avatar) return;
                avatar.classList.add("direct-presence");
                avatar.classList.toggle("presence-online", online);
                avatar.classList.toggle("presence-offline", !online);
                avatar.title = `${other.username} · ${presenceText(other)}`;
            });
        });
    }

    function updateSelectedConversationPresence() {
        if (!conversationStatus || !appData.selectedConversation) return;
        const badge = conversationAvatar?.querySelector(".online-badge");

        if (appData.selectedConversation.type === "group") {
            const activeCount = [...onlineNames].filter((name) => selectedMemberNames.has(name)).length;
            conversationStatus.textContent = `${Number(appData.selectedConversation.member_count || selectedMemberNames.size)} members · ${activeCount} active now`;
            badge?.classList.add("presence-hidden");
            badge?.classList.remove("presence-offline");
            return;
        }

        const other = selectedDirectMember();
        if (!other) {
            conversationStatus.textContent = "Offline";
            badge?.classList.add("presence-hidden");
            return;
        }
        const online = memberIsOnline(other.username);
        conversationStatus.textContent = presenceText(other);
        badge?.classList.remove("presence-hidden");
        badge?.classList.toggle("presence-offline", !online);
        if (conversationAvatar) conversationAvatar.title = `${other.username} · ${presenceText(other)}`;
    }

    function refreshPresenceSurfaces() {
        document.querySelectorAll("[data-presence-username]").forEach((element) => {
            const member = memberFor(element.dataset.presenceUsername);
            if (member) element.textContent = presenceText(member);
        });
        document.querySelectorAll("[data-presence-story]").forEach((element) => {
            const member = memberFor(element.dataset.presenceStory);
            if (member) element.title = `${member.username} · ${presenceText(member)}`;
        });
        updateSelectedConversationPresence();
        refreshConversationListPresence();
        refreshViewedUserProfile();
        if (groupMembersModal && !groupMembersModal.classList.contains("hidden")) {
            renderGroupMembers();
        }
    }

    function updateOwnProfileSurfaces() {
        setAvatar(currentUserAvatar, currentProfile.username, currentProfile.profile_picture_url);
        setAvatar(mobileProfileAvatar, currentProfile.username, currentProfile.profile_picture_url);
        setAvatar(profileModalAvatar, currentProfile.username, currentProfile.profile_picture_url);
        if (profileModalUsername) profileModalUsername.textContent = currentProfile.username;
        if (profilePictureLimit) profilePictureLimit.textContent = String(appData.profileMaxUploadMb || 5);
    }

    updateOwnProfileSurfaces();

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
            empty.innerHTML = `<div><strong>Start chatting in ${conversationName}</strong><span>Send the first message in this conversation.</span></div>`;
            messagesElement.appendChild(empty);
        }
    }

    function applyUserSearch(value) {
        const typedValue = String(value || "");
        activeUserSearch = typedValue.trim().toLocaleLowerCase();

        [desktopUserSearch, mobileUserSearch].forEach((input) => {
            if (input && input.value !== typedValue) input.value = typedValue;
        });

        document.getElementById("member-search-empty")?.remove();
        let memberMatches = 0;
        memberList?.querySelectorAll(".member-item").forEach((item) => {
            const username = String(item.dataset.username || "");
            const matches = !activeUserSearch || username.includes(activeUserSearch);
            item.hidden = !matches;
            if (matches) memberMatches += 1;
        });

        memberStories?.querySelectorAll(".story-person").forEach((story) => {
            const username = String(story.dataset.username || "");
            story.hidden = Boolean(activeUserSearch) && !username.includes(activeUserSearch);
        });

        [desktopConversationList, mobileConversationList].forEach((list) => {
            list?.querySelectorAll("[data-conversation-name]").forEach((item) => {
                const name = String(item.dataset.conversationName || "");
                item.hidden = Boolean(activeUserSearch) && !name.includes(activeUserSearch);
            });
        });

        if (memberCount) memberCount.textContent = String(memberMatches);
        if (activeUserSearch && memberMatches === 0 && memberList) {
            const empty = document.createElement("li");
            empty.id = "member-search-empty";
            empty.className = "member-search-empty";
            empty.textContent = "No username found";
            memberList.appendChild(empty);
        }
    }

    function bindUserSearch(input) {
        if (!input) return;
        input.addEventListener("input", () => applyUserSearch(input.value));
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

    function appendMessage(message, options = {}) {
        const prepend = Boolean(options.prepend);
        const shouldScroll = options.scroll !== false;
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

        article.dataset.username = String(message.username || "").toLocaleLowerCase();

        const avatar = document.createElement("button");
        avatar.type = "button";
        avatar.className = "message-avatar message-profile-trigger";
        avatar.title = `View ${message.username}'s profile`;
        avatar.addEventListener("click", () => openUserProfile(message.username));
        const member = memberFor(message.username);
        setAvatar(avatar, message.username, message.profile_picture_url || member?.profile_picture_url);

        const content = document.createElement("div");
        content.className = "message-content";
        const header = document.createElement("div");
        header.className = "message-header";

        const name = document.createElement("button");
        name.type = "button";
        name.className = "message-name message-profile-trigger";
        name.textContent = message.username;
        name.addEventListener("click", () => openUserProfile(message.username));

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
            const mediaButton = document.createElement("button");
            mediaButton.type = "button";
            mediaButton.className = "message-media-link";
            mediaButton.title = "View picture";

            const image = document.createElement("img");
            image.className = "message-image";
            image.src = attachmentUrl;
            image.alt = message.attachment_name || `${message.username} sent a picture`;
            image.loading = "lazy";
            mediaButton.appendChild(image);
            mediaButton.addEventListener("click", () => openMediaViewer({
                url: attachmentUrl,
                type: "image",
                title: message.attachment_name || "Picture",
                subtitle: `Sent by ${message.username}`,
                downloadUrl: `/api/messages/${messageId}/download`,
                alt: image.alt,
            }));
            body.appendChild(mediaButton);

            const download = document.createElement("a");
            download.className = "message-download-button";
            download.href = `/api/messages/${messageId}/download`;
            download.title = "Download picture";
            download.setAttribute("aria-label", "Download picture");
            download.textContent = "↓";
            body.appendChild(download);
        } else if (messageType === "video" && attachmentUrl) {
            body.classList.add("media-message");
            const video = document.createElement("video");
            video.className = "message-video";
            video.src = attachmentUrl;
            video.controls = true;
            video.playsInline = true;
            video.preload = "metadata";
            body.appendChild(video);

            const mediaActions = document.createElement("div");
            mediaActions.className = "message-media-actions";
            const viewButton = document.createElement("button");
            viewButton.type = "button";
            viewButton.textContent = "View";
            viewButton.addEventListener("click", () => openMediaViewer({
                url: attachmentUrl,
                type: "video",
                title: message.attachment_name || "Video",
                subtitle: `Sent by ${message.username}`,
                downloadUrl: `/api/messages/${messageId}/download`,
            }));
            const download = document.createElement("a");
            download.href = `/api/messages/${messageId}/download`;
            download.textContent = "Download";
            mediaActions.append(viewButton, download);
            body.appendChild(mediaActions);
        }

        if (message.body) {
            const text = document.createElement("div");
            text.className = messageType === "text" ? "message-text" : "message-caption";
            appendRichText(text, message.body);
            body.appendChild(text);
        }

        content.append(body, createMessageTools(message));
        article.append(avatar, content);
        if (prepend) {
            messagesElement.prepend(article);
        } else {
            messagesElement.appendChild(article);
        }
        renderReactionSummary(article, message);
        if (shouldScroll) {
            messagesElement.scrollTop = messagesElement.scrollHeight;
        }
    }

    function setHistoryStatus(text = "", visible = false) {
        if (!historyStatus) return;
        historyStatus.textContent = text;
        historyStatus.classList.toggle("hidden", !visible);
    }

    async function loadOlderMessages() {
        if (historyLoading || !historyHasMore || !oldestMessageId) return false;

        historyLoading = true;
        setHistoryStatus("Loading older messages…", true);
        const previousHeight = messagesElement.scrollHeight;
        const previousTop = messagesElement.scrollTop;

        try {
            const response = await fetch(
                `/api/messages/history?conversation_id=${encodeURIComponent(conversationId)}&before_id=${encodeURIComponent(oldestMessageId)}&limit=${historyPageSize}`,
                { headers: { Accept: "application/json" } }
            );
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || "Could not load older messages.");
            }

            const olderMessages = Array.isArray(payload.messages) ? payload.messages : [];
            olderMessages.slice().reverse().forEach((message) => {
                appendMessage(message, { prepend: true, scroll: false });
            });

            if (olderMessages.length) {
                oldestMessageId = Math.min(
                    oldestMessageId,
                    ...olderMessages.map((message) => Number(message.id)).filter(Number.isFinite)
                );
                const addedHeight = messagesElement.scrollHeight - previousHeight;
                messagesElement.scrollTop = previousTop + addedHeight;
            }

            historyHasMore = Boolean(payload.has_more);
            setHistoryStatus(historyHasMore ? "Scroll up for older messages" : "Beginning of conversation", true);
            window.setTimeout(() => setHistoryStatus("", false), 1500);
            return olderMessages.length > 0;
        } catch (error) {
            console.error("History loading failed:", error);
            chatError.textContent = error.message || "Could not load older messages.";
            setHistoryStatus("Could not load older messages", true);
            return false;
        } finally {
            historyLoading = false;
        }
    }

    async function jumpToMessage(messageId) {
        let target = document.getElementById(`message-${messageId}`);
        while (!target && historyHasMore) {
            const loaded = await loadOlderMessages();
            if (!loaded) break;
            target = document.getElementById(`message-${messageId}`);
        }
        if (!target) {
            chatError.textContent = "The original message could not be found.";
            return;
        }
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.remove("message-highlight");
        void target.offsetWidth;
        target.classList.add("message-highlight");
        window.setTimeout(() => target.classList.remove("message-highlight"), 1400);
    }


    appData.messages.forEach((message) => appendMessage(message, { scroll: false }));
    renderEmptyState();
    messagesElement.scrollTop = messagesElement.scrollHeight;
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
        formData.append("conversation_id", String(conversationId));
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

    messagesElement.addEventListener("scroll", () => {
        if (messagesElement.scrollTop <= 80) {
            void loadOlderMessages();
        }
    });

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
            void jumpToMessage(Number(button.dataset.targetMessageId || 0));
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
            conversation_id: conversationId,
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

    function setProfileStatus(text = "", isError = false) {
        if (!profileStatus) return;
        profileStatus.textContent = text;
        profileStatus.classList.toggle("error", Boolean(isError));
    }

    function refreshProfileModalFields() {
        updateOwnProfileSurfaces();
        if (profileBioInput) profileBioInput.value = currentProfile.bio || "";
        if (profileBioCount) profileBioCount.textContent = String(profileBioInput?.value.length || 0);
        if (profileNoteInput) profileNoteInput.value = activeNote(currentProfile);
        if (profileNoteCount) profileNoteCount.textContent = String(profileNoteInput?.value.length || 0);
        if (removeProfilePictureButton) removeProfilePictureButton.disabled = !currentProfile.profile_picture_url;
    }

    function openProfileModal() {
        if (!profileModal) return;
        setProfileStatus("");
        refreshProfileModalFields();
        profileModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
        window.setTimeout(() => profileNoteInput?.focus(), 80);
    }

    function closeProfileModal() {
        if (!profileModal) return;
        profileModal.classList.add("hidden");
        document.body.classList.remove("modal-open");
        setProfileStatus("");
    }

    function updateProfileEverywhere(profile) {
        const normalized = normalizeMember(profile);
        if (!normalized.username) return;
        const index = allMembers.findIndex(
            (member) => member.username.toLocaleLowerCase() === normalized.username.toLocaleLowerCase()
        );
        if (index >= 0) allMembers[index] = normalized;
        else allMembers.push(normalized);

        if (normalized.username.toLocaleLowerCase() === appData.username.toLocaleLowerCase()) {
            currentProfile = normalized;
            updateOwnProfileSurfaces();
            refreshProfileModalFields();
        }

        messageStore.forEach((message) => {
            if (String(message.username).toLocaleLowerCase() === normalized.username.toLocaleLowerCase()) {
                message.profile_picture_url = normalized.profile_picture_url;
            }
        });
        messagesElement.querySelectorAll(".message").forEach((article) => {
            if (article.dataset.username === normalized.username.toLocaleLowerCase()) {
                setAvatar(
                    article.querySelector(".message-avatar"),
                    normalized.username,
                    normalized.profile_picture_url
                );
            }
        });
        renderMembers();
        if (viewedProfileUsername.toLocaleLowerCase() === normalized.username.toLocaleLowerCase()) {
            refreshViewedUserProfile();
        }
    }

    async function readJsonResponse(response) {
        try {
            return await response.json();
        } catch {
            return {};
        }
    }

    async function uploadProfilePicture(file) {
        if (!file) return;
        const maxBytes = Number(appData.profileMaxUploadMb || 5) * 1024 * 1024;
        if (!file.type.startsWith("image/")) {
            setProfileStatus("Choose a JPG, PNG, GIF, or WEBP picture.", true);
            return;
        }
        if (file.size > maxBytes) {
            setProfileStatus(`The picture is too large. Maximum size is ${appData.profileMaxUploadMb || 5} MB.`, true);
            return;
        }

        const data = new FormData();
        data.append("file", file);
        chooseProfilePictureButton.disabled = true;
        removeProfilePictureButton.disabled = true;
        setProfileStatus("Uploading profile picture…");
        try {
            const response = await fetch("/api/profile/picture", {
                method: "POST",
                headers: { "X-CSRF-Token": appData.csrfToken },
                body: data,
            });
            const result = await readJsonResponse(response);
            if (!response.ok) throw new Error(result.error || "Could not upload the profile picture.");
            updateProfileEverywhere(result.profile);
            setProfileStatus("Profile picture updated.");
        } catch (error) {
            setProfileStatus(error.message || "Could not upload the profile picture.", true);
        } finally {
            chooseProfilePictureButton.disabled = false;
            removeProfilePictureButton.disabled = !currentProfile.profile_picture_url;
            profilePictureInput.value = "";
        }
    }

    async function removeProfilePicture() {
        if (!currentProfile.profile_picture_url) return;
        removeProfilePictureButton.disabled = true;
        setProfileStatus("Removing profile picture…");
        try {
            const response = await fetch("/api/profile/picture/remove", {
                method: "POST",
                headers: { "X-CSRF-Token": appData.csrfToken },
            });
            const result = await readJsonResponse(response);
            if (!response.ok) throw new Error(result.error || "Could not remove the profile picture.");
            updateProfileEverywhere(result.profile);
            setProfileStatus("Profile picture removed.");
        } catch (error) {
            setProfileStatus(error.message || "Could not remove the profile picture.", true);
        } finally {
            removeProfilePictureButton.disabled = !currentProfile.profile_picture_url;
        }
    }

    async function saveProfileBio(bioValue = profileBioInput?.value || "") {
        const bio = String(bioValue).trim();
        if (bio.length > 160) {
            setProfileStatus("Bios are limited to 160 characters.", true);
            return;
        }
        saveProfileBioButton.disabled = true;
        clearProfileBioButton.disabled = true;
        setProfileStatus(bio ? "Saving your bio…" : "Clearing your bio…");
        try {
            const response = await fetch("/api/profile/bio", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": appData.csrfToken,
                },
                body: JSON.stringify({ bio }),
            });
            const result = await readJsonResponse(response);
            if (!response.ok) throw new Error(result.error || "Could not update your bio.");
            updateProfileEverywhere(result.profile);
            setProfileStatus(bio ? "Bio updated." : "Bio cleared.");
        } catch (error) {
            setProfileStatus(error.message || "Could not update your bio.", true);
        } finally {
            saveProfileBioButton.disabled = false;
            clearProfileBioButton.disabled = false;
        }
    }

    async function saveProfileNote(noteValue = profileNoteInput?.value || "") {
        const note = String(noteValue).trim();
        saveProfileNoteButton.disabled = true;
        clearProfileNoteButton.disabled = true;
        setProfileStatus(note ? "Sharing your note…" : "Clearing your note…");
        try {
            const response = await fetch("/api/profile/note", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": appData.csrfToken,
                },
                body: JSON.stringify({ note }),
            });
            const result = await readJsonResponse(response);
            if (!response.ok) throw new Error(result.error || "Could not update your note.");
            updateProfileEverywhere(result.profile);
            setProfileStatus(note ? "Your note is visible for 24 hours." : "Your note was cleared.");
        } catch (error) {
            setProfileStatus(error.message || "Could not update your note.", true);
        } finally {
            saveProfileNoteButton.disabled = false;
            clearProfileNoteButton.disabled = false;
        }
    }

    document.querySelectorAll(".profile-open-button").forEach((button) => {
        button.addEventListener("click", openProfileModal);
    });
    closeProfileModalButton?.addEventListener("click", closeProfileModal);
    profileModal?.addEventListener("click", (event) => {
        if (event.target === profileModal) closeProfileModal();
    });
    chooseProfilePictureButton?.addEventListener("click", () => profilePictureInput?.click());
    profilePictureInput?.addEventListener("change", () => uploadProfilePicture(profilePictureInput.files?.[0]));
    removeProfilePictureButton?.addEventListener("click", removeProfilePicture);
    profileBioInput?.addEventListener("input", () => {
        if (profileBioCount) profileBioCount.textContent = String(profileBioInput.value.length);
    });
    saveProfileBioButton?.addEventListener("click", () => saveProfileBio());
    clearProfileBioButton?.addEventListener("click", () => {
        profileBioInput.value = "";
        if (profileBioCount) profileBioCount.textContent = "0";
        saveProfileBio("");
    });
    profileNoteInput?.addEventListener("input", () => {
        profileNoteCount.textContent = String(profileNoteInput.value.length);
    });
    profileNoteInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveProfileNote();
        }
    });
    saveProfileNoteButton?.addEventListener("click", () => saveProfileNote());
    clearProfileNoteButton?.addEventListener("click", () => {
        profileNoteInput.value = "";
        profileNoteCount.textContent = "0";
        saveProfileNote("");
    });
    backUserProfileButton?.addEventListener("click", closeUserProfile);
    userProfileModal?.addEventListener("click", (event) => {
        if (event.target === userProfileModal) closeUserProfile();
    });
    userProfilePicture?.addEventListener("click", () => {
        const member = memberFor(viewedProfileUsername);
        if (member?.profile_picture_url) {
            openMediaViewer({
                url: member.profile_picture_url,
                type: "image",
                title: `${member.username}'s profile picture`,
                subtitle: presenceText(member),
                alt: `${member.username} profile picture`,
            });
        }
    });
    userProfileMessageButton?.addEventListener("click", () => {
        const member = memberFor(viewedProfileUsername);
        if (!member) return;
        closeUserProfile();
        if (member.username.toLocaleLowerCase() === appData.username.toLocaleLowerCase()) {
            openProfileModal();
        } else {
            startPrivateChat(member);
        }
    });
    mediaViewerBack?.addEventListener("click", closeMediaViewer);
    mediaViewerModal?.addEventListener("click", (event) => {
        if (event.target === mediaViewerModal || event.target === mediaViewerStage) closeMediaViewer();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!mediaViewerModal?.classList.contains("hidden")) {
            closeMediaViewer();
        } else if (!userProfileModal?.classList.contains("hidden")) {
            closeUserProfile();
        } else if (!profileModal?.classList.contains("hidden")) {
            closeProfileModal();
        }
    });

    socket.on("profile_updated", (payload) => {
        if (payload?.profile) updateProfileEverywhere(payload.profile);
    });

    socket.on("conversation_profile_updated", (payload) => {
        if (payload?.conversation) applyConversationProfile(payload.conversation);
    });

    socket.on("conversation_members_updated", (payload) => {
        if (Number(payload?.conversation_id || 0) !== conversationId) return;
        if (payload?.conversation?.members) {
            selectedConversationMembers = payload.conversation.members.map(normalizeMember);
            selectedMemberNames.clear();
            selectedConversationMembers.forEach((member) => selectedMemberNames.add(member.username));
            if (appData.selectedConversation) Object.assign(appData.selectedConversation, payload.conversation);
            if (groupOptionsMemberCount) {
                groupOptionsMemberCount.textContent = `${selectedConversationMembers.length} people`;
            }
        }
        updateSelectedConversationPresence();
        renderGroupMembers();
    });

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
            await notificationRegistration.showNotification("GChats", {
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
        if (document.visibilityState === "visible" && document.hasFocus() && Number(message.conversation_id) === conversationId) return;
        const registration = notificationRegistration || await navigator.serviceWorker.ready;
        const conversation = (appData.conversations || []).find((item) => Number(item.id) === Number(message.conversation_id));
        const chatName = conversation?.name || "GChats";
        const fullMessage = String(message.body || "");
        const fallback = message.message_type === "image"
            ? "Sent a picture"
            : message.message_type === "video"
                ? "Sent a video"
                : "Sent a message";
        const notificationText = fullMessage || fallback;
        const preview = notificationText.length > 120 ? `${notificationText.slice(0, 117)}...` : notificationText;
        await registration.showNotification(`${message.username} · ${chatName}`, {
            body: preview,
            tag: `message-${message.id}`,
            icon: "/static/icon-192.png",
            data: { url: `/chat/${message.conversation_id}` },
            vibrate: [180, 80, 180],
        });
    }

    socket.on("new_message", (message) => {
        const belongsHere = Number(message?.conversation_id || 0) === conversationId;
        if (belongsHere) appendMessage(message);
        if (message.username !== appData.username && (!belongsHere || document.hidden || !document.hasFocus())) {
            unreadMessageCount += 1;
            updateUnreadTitle();
            showMessageNotification(message).catch((error) => {
                console.error("Notification failed:", error);
            });
        }
    });

    socket.on("conversation_created", () => {
        if (!conversationId) window.location.reload();
    });

    socket.on("conversation_updated", (payload) => {
        if (!conversationId && Number(payload?.conversation_id || 0)) {
            window.clearTimeout(window.__gchatsInboxRefresh);
            window.__gchatsInboxRefresh = window.setTimeout(() => window.location.reload(), 700);
        }
    });

    socket.on("reaction_updated", (payload) => {
        if (Number(payload?.conversation_id || 0) !== conversationId) return;
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

    async function startPrivateChat(member) {
        if (!member?.id || member.username === appData.username) {
            openProfileModal();
            return;
        }
        chatError.textContent = "";
        try {
            const response = await fetch("/api/conversations/private", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": appData.csrfToken,
                },
                body: JSON.stringify({ user_id: member.id }),
            });
            const payload = await readJsonResponse(response);
            if (!response.ok) throw new Error(payload.error || "Could not open the private chat.");
            window.location.href = payload.url;
        } catch (error) {
            const text = error.message || "Could not open the private chat.";
            if (chatError) chatError.textContent = text;
            alert(text);
        }
    }

    function currentTheme() {
        return document.documentElement.dataset.theme === "light" ? "light" : "dark";
    }

    function updateThemeControls() {
        const theme = currentTheme();
        themeChoiceButtons.forEach((button) => {
            const selected = button.dataset.themeChoice === theme;
            button.classList.toggle("active", selected);
            button.setAttribute("aria-pressed", selected ? "true" : "false");
        });

        const themeColorMeta = document.getElementById("theme-color-meta");
        if (themeColorMeta) {
            themeColorMeta.setAttribute("content", theme === "light" ? "#ffffff" : "#000000");
        }
    }

    function setTheme(theme) {
        const normalizedTheme = theme === "light" ? "light" : "dark";
        document.documentElement.dataset.theme = normalizedTheme;
        localStorage.setItem("gchats-theme", normalizedTheme);
        updateThemeControls();
    }

    function setSettingsOpen(open) {
        if (!menuSettingsSection || !menuSettingsToggle) return;
        menuSettingsSection.classList.toggle("hidden", !open);
        menuSettingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
        if (settingsChevron) settingsChevron.textContent = open ? "⌄" : "›";
    }

    function setAppMenuOpen(open) {
        if (!appMenuOverlay) return;
        appMenuOverlay.classList.toggle("hidden", !open);
        appMenuOverlay.setAttribute("aria-hidden", open ? "false" : "true");
        [desktopAppMenuButton, mobileAppMenuButton].forEach((button) => {
            button?.setAttribute("aria-expanded", open ? "true" : "false");
        });
        document.body.classList.toggle("menu-open", open);
        if (open) {
            updateThemeControls();
            window.setTimeout(() => closeAppMenuButton?.focus(), 60);
        } else {
            setSettingsOpen(false);
        }
    }

    function openAppMenu() {
        setAppMenuOpen(true);
    }

    function closeAppMenu() {
        setAppMenuOpen(false);
    }

    desktopAppMenuButton?.addEventListener("click", openAppMenu);
    mobileAppMenuButton?.addEventListener("click", openAppMenu);
    closeAppMenuButton?.addEventListener("click", closeAppMenu);
    appMenuPanel?.addEventListener("click", (event) => event.stopPropagation());
    appMenuOverlay?.addEventListener("click", closeAppMenu);
    menuSettingsToggle?.addEventListener("click", () => {
        setSettingsOpen(menuSettingsSection?.classList.contains("hidden") ?? true);
    });
    themeChoiceButtons.forEach((button) => {
        button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
    });
    menuCreateGroupButton?.addEventListener("click", () => {
        closeAppMenu();
        window.setTimeout(openGroupModal, 30);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !appMenuOverlay?.classList.contains("hidden")) {
            closeAppMenu();
        }
    });
    updateThemeControls();

    function updateGroupSelectedCount() {
        if (!groupSelectedCount || !groupMemberOptions) return;
        const selected = groupMemberOptions.querySelectorAll('input[type="checkbox"]:checked').length;
        groupSelectedCount.textContent = String(selected);
    }

    function filterGroupMemberOptions() {
        if (!groupMemberOptions) return;
        const search = String(groupMemberSearch?.value || "").trim().toLocaleLowerCase();
        let visibleCount = 0;
        groupMemberOptions.querySelectorAll(".group-member-option").forEach((option) => {
            const username = String(option.dataset.username || "");
            const matches = !search || username.includes(search);
            option.hidden = !matches;
            if (matches) visibleCount += 1;
        });

        let empty = document.getElementById("group-member-search-empty");
        if (search && visibleCount === 0) {
            if (!empty) {
                empty = document.createElement("div");
                empty.id = "group-member-search-empty";
                empty.className = "group-member-search-empty";
                empty.textContent = "No username found";
                groupMemberOptions.appendChild(empty);
            }
        } else {
            empty?.remove();
        }
    }

    function renderGroupMemberOptions() {
        if (!groupMemberOptions) return;
        groupMemberOptions.replaceChildren();
        allMembers
            .filter((member) => member.username !== appData.username)
            .forEach((member) => {
                const label = document.createElement("label");
                label.className = "group-member-option";
                label.dataset.username = member.username.toLocaleLowerCase();
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = String(member.id);
                checkbox.addEventListener("change", updateGroupSelectedCount);
                const avatar = document.createElement("span");
                avatar.className = "avatar";
                setAvatar(avatar, member.username, member.profile_picture_url);
                const copy = document.createElement("span");
                copy.className = "group-member-copy";
                const name = document.createElement("strong");
                name.textContent = member.username;
                const status = document.createElement("small");
                status.dataset.presenceUsername = member.username;
                status.textContent = presenceText(member);
                copy.append(name, status);
                label.append(checkbox, avatar, copy);
                groupMemberOptions.appendChild(label);
            });
        updateGroupSelectedCount();
        filterGroupMemberOptions();
    }

    function openGroupModal() {
        if (!newGroupModal) return;
        groupNameInput.value = "";
        if (groupMemberSearch) groupMemberSearch.value = "";
        groupCreateStatus.textContent = "";
        groupCreateStatus.classList.remove("error");
        renderGroupMemberOptions();
        newGroupModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
        window.setTimeout(() => groupNameInput?.focus(), 80);
    }

    function closeGroupModal() {
        newGroupModal?.classList.add("hidden");
        document.body.classList.remove("modal-open");
    }

    async function createGroupChat() {
        const name = groupNameInput?.value.trim() || "";
        const memberIds = [...(groupMemberOptions?.querySelectorAll('input[type="checkbox"]:checked') || [])]
            .map((input) => Number(input.value))
            .filter(Number.isFinite);
        groupCreateStatus.textContent = "";
        createGroupButton.disabled = true;
        try {
            const response = await fetch("/api/conversations/group", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": appData.csrfToken,
                },
                body: JSON.stringify({ name, member_ids: memberIds }),
            });
            const payload = await readJsonResponse(response);
            if (!response.ok) throw new Error(payload.error || "Could not create the group chat.");
            window.location.href = payload.url;
        } catch (error) {
            groupCreateStatus.textContent = error.message || "Could not create the group chat.";
            groupCreateStatus.classList.add("error");
        } finally {
            createGroupButton.disabled = false;
        }
    }

    openGroupModalButton?.addEventListener("click", openGroupModal);
    mobileOpenGroupModalButton?.addEventListener("click", openGroupModal);
    closeGroupModalButton?.addEventListener("click", closeGroupModal);
    createGroupButton?.addEventListener("click", createGroupChat);
    groupMemberSearch?.addEventListener("input", filterGroupMemberOptions);
    groupMemberSearch?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            groupMemberSearch.value = "";
            filterGroupMemberOptions();
            groupMemberSearch.blur();
        }
    });
    newGroupModal?.addEventListener("click", (event) => {
        if (event.target === newGroupModal) closeGroupModal();
    });

    function setConversationAvatar(element, name, pictureUrl) {
        if (!element) return;
        const onlineBadge = element.querySelector(".online-badge");
        setAvatar(element, name, pictureUrl);
        if (onlineBadge) element.appendChild(onlineBadge);
    }

    function closeGroupOptionsMenu() {
        groupOptionsMenu?.classList.add("hidden");
        groupOptionsButton?.setAttribute("aria-expanded", "false");
    }

    function toggleGroupOptionsMenu() {
        if (!groupOptionsMenu || !groupOptionsButton) return;
        const willOpen = groupOptionsMenu.classList.contains("hidden");
        groupOptionsMenu.classList.toggle("hidden", !willOpen);
        groupOptionsButton.setAttribute("aria-expanded", String(willOpen));
    }

    function renderGroupMembers() {
        if (!groupMembersList) return;
        groupMembersList.replaceChildren();
        const members = selectedConversationMembers
            .map((member) => memberFor(member.username) || member)
            .sort((a, b) => {
                const onlineDifference = Number(memberIsOnline(b.username)) - Number(memberIsOnline(a.username));
                return onlineDifference || a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
            });

        if (groupMembersSummary) {
            const activeCount = members.filter((member) => memberIsOnline(member.username)).length;
            groupMembersSummary.textContent = `${members.length} members · ${activeCount} active now`;
        }

        members.forEach((member) => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "group-member-view-row";

            const avatar = document.createElement("span");
            avatar.className = "avatar group-member-view-avatar";
            setAvatar(avatar, member.username, member.profile_picture_url);
            const dot = document.createElement("span");
            dot.className = `group-member-view-dot ${memberIsOnline(member.username) ? "online" : "offline"}`;
            avatar.appendChild(dot);

            const copy = document.createElement("span");
            copy.className = "group-member-view-copy";
            const name = document.createElement("strong");
            name.textContent = member.username === appData.username ? `${member.username} (You)` : member.username;
            const status = document.createElement("small");
            status.textContent = presenceText(member);
            copy.append(name, status);

            const arrow = document.createElement("span");
            arrow.className = "group-member-view-arrow";
            arrow.textContent = "›";
            row.append(avatar, copy, arrow);
            row.addEventListener("click", () => {
                closeGroupMembersModal();
                openUserProfile(member.username);
            });
            groupMembersList.appendChild(row);
        });
    }

    function openGroupMembersModal() {
        if (!groupMembersModal || appData.selectedConversation?.type !== "group") return;
        closeGroupOptionsMenu();
        renderGroupMembers();
        groupMembersModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    }

    function closeGroupMembersModal() {
        groupMembersModal?.classList.add("hidden");
        document.body.classList.remove("modal-open");
    }

    function openLeaveGroupModal() {
        if (!leaveGroupModal || appData.selectedConversation?.type !== "group") return;
        closeGroupOptionsMenu();
        if (appData.selectedConversation?.is_default) {
            window.alert("You cannot leave the main Kulot Friends group.");
            return;
        }
        if (leaveGroupStatus) {
            leaveGroupStatus.textContent = "";
            leaveGroupStatus.classList.remove("error");
        }
        leaveGroupModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    }

    function closeLeaveGroupModal() {
        leaveGroupModal?.classList.add("hidden");
        document.body.classList.remove("modal-open");
    }

    async function leaveCurrentGroup() {
        if (!conversationId || appData.selectedConversation?.type !== "group") return;
        if (!confirmLeaveGroupButton) return;
        confirmLeaveGroupButton.disabled = true;
        if (leaveGroupStatus) {
            leaveGroupStatus.textContent = "Leaving group…";
            leaveGroupStatus.classList.remove("error");
        }
        try {
            const response = await fetch(`/api/conversations/${conversationId}/leave`, {
                method: "POST",
                headers: { "X-CSRF-Token": appData.csrfToken },
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "Could not leave the group.");
            window.location.assign("/chat");
        } catch (error) {
            if (leaveGroupStatus) {
                leaveGroupStatus.textContent = error.message || "Could not leave the group.";
                leaveGroupStatus.classList.add("error");
            }
            confirmLeaveGroupButton.disabled = false;
        }
    }

    function applyConversationProfile(conversation) {
        if (!conversation) return;
        const updatedId = Number(conversation.id || 0);
        const updatedName = String(conversation.name || "Group chat");
        const avatarUrl = conversation.avatar_url || null;

        if (Array.isArray(appData.conversations)) {
            const stored = appData.conversations.find((item) => Number(item.id) === updatedId);
            if (stored) Object.assign(stored, conversation);
        }

        document.querySelectorAll(`[data-conversation-id="${updatedId}"]`).forEach((item) => {
            item.dataset.conversationName = updatedName.toLocaleLowerCase();
            const nameElement = item.querySelector(".conversation-card-copy strong, .mobile-conversation-copy strong");
            if (nameElement) nameElement.textContent = updatedName;
            const avatarElement = item.querySelector(".conversation-card-avatar, .mobile-conversation-avatar");
            setAvatar(avatarElement, updatedName, avatarUrl);
        });

        if (updatedId === conversationId) {
            conversationName = updatedName;
            if (appData.selectedConversation) Object.assign(appData.selectedConversation, conversation);
            if (conversationNameElement) conversationNameElement.textContent = updatedName;
            setConversationAvatar(conversationAvatar, updatedName, avatarUrl);
            setAvatar(groupProfileAvatar, updatedName, avatarUrl);
            if (editGroupNameInput && document.activeElement !== editGroupNameInput) {
                editGroupNameInput.value = updatedName;
                if (editGroupNameCount) editGroupNameCount.textContent = String(updatedName.length);
            }
        }
    }

    function setGroupProfileStatus(message, isError = false) {
        if (!groupProfileStatus) return;
        groupProfileStatus.textContent = message;
        groupProfileStatus.classList.toggle("error", isError);
    }

    function clearGroupPicturePreview() {
        if (groupPicturePreviewUrl) {
            URL.revokeObjectURL(groupPicturePreviewUrl);
            groupPicturePreviewUrl = null;
        }
    }

    function resetGroupProfileForm() {
        const selected = appData.selectedConversation;
        if (!selected || selected.type !== "group") return;
        pendingGroupPictureFile = null;
        removeGroupPictureRequested = false;
        clearGroupPicturePreview();
        if (groupPictureInput) groupPictureInput.value = "";
        if (editGroupNameInput) editGroupNameInput.value = String(selected.name || "");
        if (editGroupNameCount) editGroupNameCount.textContent = String(editGroupNameInput?.value.length || 0);
        if (groupPictureLimit) groupPictureLimit.textContent = String(appData.profileMaxUploadMb || 5);
        setAvatar(groupProfileAvatar, selected.name || "Group chat", selected.avatar_url);
        if (removeGroupPictureButton) removeGroupPictureButton.disabled = !selected.avatar_url;
        setGroupProfileStatus("");
    }

    function openGroupProfileModal() {
        if (!groupProfileModal || appData.selectedConversation?.type !== "group") return;
        resetGroupProfileForm();
        groupProfileModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
        window.setTimeout(() => editGroupNameInput?.focus(), 80);
    }

    function closeGroupProfileModal() {
        groupProfileModal?.classList.add("hidden");
        document.body.classList.remove("modal-open");
        clearGroupPicturePreview();
    }

    async function saveGroupProfile() {
        if (!conversationId || appData.selectedConversation?.type !== "group") return;
        const name = String(editGroupNameInput?.value || "").trim();
        if (!name || name.length > 60) {
            setGroupProfileStatus("Group name must be 1–60 characters.", true);
            return;
        }

        const formData = new FormData();
        formData.append("name", name);
        if (pendingGroupPictureFile) formData.append("file", pendingGroupPictureFile);
        if (removeGroupPictureRequested && !pendingGroupPictureFile) formData.append("remove_picture", "true");

        saveGroupProfileButton.disabled = true;
        setGroupProfileStatus("Saving group changes…");
        try {
            const response = await fetch(`/api/conversations/${conversationId}/profile`, {
                method: "POST",
                headers: { "X-CSRF-Token": appData.csrfToken },
                body: formData,
            });
            const result = await readJsonResponse(response);
            if (!response.ok) throw new Error(result.error || "Could not update the group chat.");
            applyConversationProfile(result.conversation);
            setGroupProfileStatus("Group chat updated.");
            window.setTimeout(closeGroupProfileModal, 350);
        } catch (error) {
            setGroupProfileStatus(error.message || "Could not update the group chat.", true);
        } finally {
            saveGroupProfileButton.disabled = false;
        }
    }

    groupOptionsButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleGroupOptionsMenu();
    });
    groupOptionsMenu?.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", closeGroupOptionsMenu);
    viewGroupMembersButton?.addEventListener("click", openGroupMembersModal);
    leaveGroupButton?.addEventListener("click", openLeaveGroupModal);
    backGroupMembersButton?.addEventListener("click", closeGroupMembersModal);
    groupMembersModal?.addEventListener("click", (event) => {
        if (event.target === groupMembersModal) closeGroupMembersModal();
    });
    closeLeaveGroupModalButton?.addEventListener("click", closeLeaveGroupModal);
    cancelLeaveGroupButton?.addEventListener("click", closeLeaveGroupModal);
    leaveGroupModal?.addEventListener("click", (event) => {
        if (event.target === leaveGroupModal) closeLeaveGroupModal();
    });
    confirmLeaveGroupButton?.addEventListener("click", leaveCurrentGroup);

    editGroupButton?.addEventListener("click", openGroupProfileModal);
    closeGroupProfileModalButton?.addEventListener("click", closeGroupProfileModal);
    groupProfileModal?.addEventListener("click", (event) => {
        if (event.target === groupProfileModal) closeGroupProfileModal();
    });
    chooseGroupPictureButton?.addEventListener("click", () => groupPictureInput?.click());
    groupPictureInput?.addEventListener("change", () => {
        const file = groupPictureInput.files?.[0];
        if (!file) return;
        const maxBytes = Number(appData.profileMaxUploadMb || 5) * 1024 * 1024;
        if (file.size > maxBytes) {
            setGroupProfileStatus(`Group pictures are limited to ${appData.profileMaxUploadMb || 5} MB.`, true);
            groupPictureInput.value = "";
            return;
        }
        pendingGroupPictureFile = file;
        removeGroupPictureRequested = false;
        clearGroupPicturePreview();
        groupPicturePreviewUrl = URL.createObjectURL(file);
        setAvatar(groupProfileAvatar, editGroupNameInput?.value || conversationName, groupPicturePreviewUrl);
        if (removeGroupPictureButton) removeGroupPictureButton.disabled = false;
        setGroupProfileStatus("Picture selected. Press Save changes.");
    });
    removeGroupPictureButton?.addEventListener("click", () => {
        pendingGroupPictureFile = null;
        removeGroupPictureRequested = true;
        clearGroupPicturePreview();
        if (groupPictureInput) groupPictureInput.value = "";
        setAvatar(groupProfileAvatar, editGroupNameInput?.value || conversationName, null);
        removeGroupPictureButton.disabled = true;
        setGroupProfileStatus("Group picture will be removed after saving.");
    });
    editGroupNameInput?.addEventListener("input", () => {
        if (editGroupNameCount) editGroupNameCount.textContent = String(editGroupNameInput.value.length);
        if (!pendingGroupPictureFile && removeGroupPictureRequested) {
            setAvatar(groupProfileAvatar, editGroupNameInput.value || "GC", null);
        }
    });
    editGroupNameInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveGroupProfile();
        }
    });
    saveGroupProfileButton?.addEventListener("click", saveGroupProfile);
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        closeGroupOptionsMenu();
        if (!leaveGroupModal?.classList.contains("hidden")) {
            closeLeaveGroupModal();
        } else if (!groupMembersModal?.classList.contains("hidden")) {
            closeGroupMembersModal();
        } else if (!groupProfileModal?.classList.contains("hidden")) {
            closeGroupProfileModal();
        }
    });

    let noteExpiryTimer = null;

    function scheduleNoteRefresh() {
        if (noteExpiryTimer) window.clearTimeout(noteExpiryTimer);
        const expirations = allMembers
            .map((member) => new Date(member.note_expires_at || "").getTime())
            .filter((time) => Number.isFinite(time) && time > Date.now());
        if (!expirations.length) return;
        const delay = Math.max(250, Math.min(...expirations) - Date.now() + 200);
        noteExpiryTimer = window.setTimeout(renderMembers, Math.min(delay, 2147483000));
    }

    function renderMembers() {
        memberList?.replaceChildren();
        memberStories?.replaceChildren();

        const orderedMembers = [...allMembers].sort((a, b) => {
            if (a.username === appData.username) return -1;
            if (b.username === appData.username) return 1;
            const onlineDifference = Number(onlineNames.has(b.username)) - Number(onlineNames.has(a.username));
            return onlineDifference || a.username.localeCompare(b.username);
        });

        let privateCount = 0;
        orderedMembers.forEach((member) => {
            const username = member.username;
            const note = activeNote(member);
            const online = onlineNames.has(username);

            if (username !== appData.username && memberList) {
                privateCount += 1;
                const item = document.createElement("li");
                item.className = `member-item${online ? "" : " offline"}`;
                item.dataset.username = username.toLocaleLowerCase();

                const button = document.createElement("button");
                button.type = "button";
                button.className = "private-chat-button";
                button.title = `Message ${username}`;
                const avatar = document.createElement("span");
                avatar.className = "avatar";
                setAvatar(avatar, username, member.profile_picture_url);
                const details = document.createElement("span");
                details.className = "member-details";
                const name = document.createElement("strong");
                name.textContent = username;
                if (note) {
                    const noteStatus = document.createElement("small");
                    noteStatus.className = "member-note-text";
                    noteStatus.textContent = note;
                    details.append(name, noteStatus);
                } else {
                    details.appendChild(name);
                }
                const presenceStatus = document.createElement("small");
                presenceStatus.className = "member-presence";
                presenceStatus.dataset.presenceUsername = username;
                presenceStatus.textContent = presenceText(member);
                details.appendChild(presenceStatus);
                button.append(avatar, details);
                button.addEventListener("click", () => startPrivateChat(member));
                item.appendChild(button);
                memberList.appendChild(item);
            }

            if (memberStories) {
                const story = document.createElement("button");
                story.type = "button";
                story.className = `story-person${online ? "" : " offline"}`;
                story.dataset.username = username.toLocaleLowerCase();
                story.dataset.presenceStory = username;
                story.title = username === appData.username
                    ? "Edit profile or note"
                    : `${username} · ${presenceText(member)}`;
                story.addEventListener("click", () => {
                    if (username === appData.username) openProfileModal();
                    else openUserProfile(username);
                });

                const storyWrap = document.createElement("div");
                storyWrap.className = "story-avatar-wrap";
                const storyAvatar = document.createElement("span");
                storyAvatar.className = "story-avatar";
                setAvatar(storyAvatar, username, member.profile_picture_url);
                const storyOnline = document.createElement("span");
                storyOnline.className = "story-online";
                const storyName = document.createElement("small");
                storyName.textContent = username === appData.username ? "You" : username;

                if (note || username === appData.username) {
                    const noteBubble = document.createElement("span");
                    noteBubble.className = `story-note${note ? "" : " empty-note"}`;
                    noteBubble.textContent = note || "Add note";
                    story.appendChild(noteBubble);
                }
                storyWrap.append(storyAvatar, storyOnline);
                story.append(storyWrap, storyName);
                memberStories.appendChild(story);
            }
        });

        if (memberCount) memberCount.textContent = String(privateCount);
        applyUserSearch(activeUserSearch);
        scheduleNoteRefresh();
        renderGroupMemberOptions();
        refreshPresenceSurfaces();
    }

    conversationAvatar?.addEventListener("click", () => {
        const member = selectedDirectMember();
        if (member) openUserProfile(member.username);
    });

    socket.on("online_users", (payload) => {
        const users = Array.isArray(payload?.users) ? payload.users : [];
        if (Array.isArray(payload?.members)) {
            allMembers = payload.members.map(normalizeMember).filter((member) => member.username);
            const own = memberFor(appData.username);
            if (own) currentProfile = own;
            updateOwnProfileSurfaces();
        }
        onlineNames = new Set(users);
        renderMembers();
    });

    function sendPresenceHeartbeat() {
        if (socket.connected) socket.emit("presence_heartbeat");
    }

    socket.on("connect", sendPresenceHeartbeat);
    window.setInterval(sendPresenceHeartbeat, 60 * 1000);
    window.setInterval(refreshPresenceSurfaces, 30 * 1000);

    renderMembers();
    sendPresenceHeartbeat();

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
        if (Number(payload?.conversation_id || 0) !== conversationId) return;
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
        if (Number(payload?.conversation_id || 0) !== conversationId || !inCall) return;
        peerNames.set(payload.sid, payload.username || "Friend");
        callStatus.textContent = `${payload.username || "A friend"} joined`;
    });

    socket.on("webrtc_offer", async (payload) => {
        if (Number(payload?.conversation_id || 0) !== conversationId || !inCall) return;
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
        if (Number(payload?.conversation_id || 0) !== conversationId) return;
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
        if (Number(payload?.conversation_id || 0) !== conversationId) return;
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
        if (Number(payload?.conversation_id || 0) !== conversationId) return;
        removePeer(payload.sid);
        callStatus.textContent = `${payload.username || "A friend"} left`;
    });

    function showIncomingCall(call) {
        if (!call || Number(call.conversation_id || 0) !== conversationId || inCall || call.started_by === appData.username) return;
        const isVideo = call.mode === "video";
        incomingCallIcon.textContent = isVideo ? "📹" : "☎";
        incomingCallTitle.textContent = isVideo ? "Incoming video call" : "Incoming voice call";
        incomingCallText.textContent = `${call.started_by} is calling ${conversationName}`;
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
            activeCallTitle.textContent = isVideo ? "Video call in progress" : "Voice call in progress";
            const count = Number(activeCall.participant_count || 0);
            activeCallDetails.textContent = `Started by ${activeCall.started_by} · ${count} participant${count === 1 ? "" : "s"}`;
            joinActiveCallButton.textContent = isVideo ? "Join video call" : "Join voice call";
            activeCallBanner.classList.remove("hidden");
        } else {
            activeCallBanner.classList.add("hidden");
        }

        if (inCall) {
            callHeading.textContent = currentCallMode === "video" ? "Video call" : "Voice call";
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
        if (!conversationId) {
            alert("Open a private chat or group chat first.");
            return;
        }
        if (inCall) return;
        if (activeCall) {
            await joinExistingCall();
            return;
        }

        try {
            await openLocalCall(mode);
            socket.emit("start_group_call", { mode, conversation_id: conversationId });
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
            socket.emit("join_call", { conversation_id: conversationId });
        } catch (error) {
            console.error(error);
            alert(error.message || "Microphone/camera permission was denied or no device is available.");
            cleanupLocalCall(false);
        }
    }

    function cleanupLocalCall(notifyServer = true) {
        if (notifyServer && inCall) socket.emit("leave_call", { conversation_id: conversationId });
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
        if (Number(payload?.conversation_id || 0) !== conversationId) return;
        setActiveCall(payload?.call || null);
    });

    socket.on("call_started", (payload) => {
        const call = payload?.call || null;
        if (Number(call?.conversation_id || 0) !== conversationId) return;
        setActiveCall(call);
        showIncomingCall(call);
    });

    socket.on("call_already_active", (payload) => {
        if (Number(payload?.call?.conversation_id || 0) !== conversationId) return;
        cleanupLocalCall(false);
        setActiveCall(payload?.call || null);
        showIncomingCall(activeCall);
    });

    socket.on("call_start_error", (payload) => {
        cleanupLocalCall(false);
        setActiveCall(null);
        alert(payload?.message || "The call could not be joined.");
    });

    socket.on("call_ended", (payload) => {
        if (Number(payload?.conversation_id || 0) !== conversationId) return;
        hideIncomingCall();
        setActiveCall(null);
        if (inCall) cleanupLocalCall(false);
    });

    socket.on("connect", () => {
        if (conversationId) socket.emit("get_call_state", { conversation_id: conversationId });
    });

    window.addEventListener("beforeunload", () => {
        if (inCall) socket.emit("leave_call", { conversation_id: conversationId });
    });
})();
