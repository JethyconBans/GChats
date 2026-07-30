"use strict";

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const targetUrl = event.notification.data?.url || "/chat";

    event.waitUntil(
        (async () => {
            const openWindows = await clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            for (const windowClient of openWindows) {
                if ("focus" in windowClient) {
                    await windowClient.focus();

                    if ("navigate" in windowClient) {
                        await windowClient.navigate(targetUrl);
                    }

                    return;
                }
            }

            if (clients.openWindow) {
                await clients.openWindow(targetUrl);
            }
        })()
    );
});