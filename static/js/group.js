(() => {
    "use strict";

    const appData = window.APP_DATA;
    const socket = io({ transports: ["websocket", "polling"] });

    const messagesElement = document.getElementById("messages");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message-input");
    const chatError = document.getElementById("chat-error");
    const memberList = document.getElementById("member-list");
    const memberCount = document.getElementById("member-count");
    const onlineCount = document.getElementById("online-count");
    const currentUsername = document.getElementById("current-username");
    const notificationButton = document.getElementById("notification-button");

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
    const peerNames = new Map();
    const pendingIce = new Map();
    const normalPageTitle = document.title;
    let allMembers = Array.isArray(appData.members) ? appData.members : [];

    let onlineNames = new Set();
    let localStream = null;
    let inCall = false;
    let currentCallMode = null;
    let activeCall = null;
    let notificationRegistration = null;
    let unreadMessageCount = 0;

    currentUsername.textContent = appData.username;

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

    function updateNotificationButton() {
    if (!notificationButton) return;

    if (Notification.permission === "granted") {
        notificationButton.textContent = "🔔";
        notificationButton.title = "Message notifications enabled";
        notificationButton.setAttribute(
            "aria-label",
            "Message notifications enabled"
        );
    } else if (Notification.permission === "denied") {
        notificationButton.textContent = "🔕";
        notificationButton.title = "Notifications are blocked";
        notificationButton.setAttribute(
            "aria-label",
            "Notifications are blocked"
        );
    } else {
        notificationButton.textContent = "🔔";
        notificationButton.title = "Enable message notifications";
        notificationButton.setAttribute(
            "aria-label",
            "Enable message notifications"
        );
    }
}

async function registerNotificationWorker() {
    if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator)
    ) {
        if (notificationButton) {
            notificationButton.hidden = true;
        }

        return;
    }

    try {
        notificationRegistration =
            await navigator.serviceWorker.register("/sw.js", {
                scope: "/",
            });
    } catch (error) {
        console.error("Service worker registration failed:", error);
    }

    updateNotificationButton();
}

async function enableNotifications() {
    if (!("Notification" in window)) {
        alert("This browser does not support notifications.");
        return;
    }

    if (Notification.permission === "denied") {
        alert(
            "Notifications are blocked. Open your browser's site settings and allow notifications for this website."
        );
        return;
    }

    try {
        const permission = await Notification.requestPermission();

        updateNotificationButton();

        if (permission !== "granted") {
            return;
        }

        if (!notificationRegistration) {
            notificationRegistration =
                await navigator.serviceWorker.register("/sw.js", {
                    scope: "/",
                });
        }

        await notificationRegistration.showNotification(
            "Kulot Friends",
            {
                body: "Message notifications are now enabled.",
                tag: "notifications-enabled",
                data: {
                    url: "/chat",
                },
            }
        );
    } catch (error) {
        console.error("Could not enable notifications:", error);
    }
}

async function showMessageNotification(message) {
    if (message.username === appData.username) {
        return;
    }

    if (
        document.visibilityState === "visible" &&
        document.hasFocus()
    ) {
        return;
    }

    if (Notification.permission !== "granted") {
        return;
    }

    const registration =
        notificationRegistration ||
        await navigator.serviceWorker.ready;

    const fullMessage = String(message.body || "");
    const preview =
        fullMessage.length > 120
            ? `${fullMessage.slice(0, 117)}...`
            : fullMessage;

    await registration.showNotification(
        `${message.username} sent a message`,
        {
            body: preview,
            tag: `message-${message.id}`,
            data: {
                url: "/chat",
            },
            vibrate: [200, 100, 200],
        }
    );
}

function updateUnreadTitle() {
    document.title =
        unreadMessageCount > 0
            ? `(${unreadMessageCount}) ${normalPageTitle}`
            : normalPageTitle;
}

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

notificationButton?.addEventListener(
    "click",
    enableNotifications
);

registerNotificationWorker();

    function appendMessage(message) {
        document.getElementById("empty-state")?.remove();

        const article = document.createElement("article");
        article.className = `message${message.username === appData.username ? " own-message" : ""}`;

        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = initials(message.username);

        const content = document.createElement("div");
        const header = document.createElement("div");
        header.className = "message-header";

        const name = document.createElement("span");
        name.className = "message-name";
        name.textContent = message.username;

        const time = document.createElement("time");
        time.className = "message-time";
        time.dateTime = message.sent_at;
        time.textContent = formatTime(message.sent_at);

        const body = document.createElement("div");
        body.className = "message-body";
        body.textContent = message.body;

        header.append(name, time);
        content.append(header, body);
        article.append(avatar, content);
        messagesElement.appendChild(article);
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }

    appData.messages.forEach(appendMessage);
    renderEmptyState();

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
        socket.emit("send_message", { body });
        messageInput.value = "";
        messageInput.style.height = "auto";
        chatError.textContent = "";
        messageInput.focus();
    });

socket.on("new_message", (message) => {
    appendMessage(message);

    if (
        message.username !== appData.username &&
        (document.hidden || !document.hasFocus())
    ) {
        unreadMessageCount += 1;
        updateUnreadTitle();

        showMessageNotification(message).catch((error) => {
            console.error("Notification failed:", error);
        });
    }
});

socket.on("chat_error", (payload) => {
    chatError.textContent =
        payload?.message || "Could not send the message.";
});

    function renderMembers() {
        memberList.replaceChildren();
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
        });
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
