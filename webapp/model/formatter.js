sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Formats an OData Edm.Time value into a readable HH:MM:SS string.
         *
         * OData V2 returns Edm.Time as an object: { ms: <milliseconds>, __edmType: "Edm.Time" }
         * or sometimes as an ISO 8601 duration string like "PT23H19M39S".
         *
         * @param {object|string} vTime - The Edm.Time value
         * @returns {string} Formatted time string like "23:19:39"
         */
        formatTime: function (vTime) {
            if (!vTime) {
                return "";
            }

            var iTotalMs;

            // Case 1: Object with ms property (standard OData V2 Edm.Time)
            if (typeof vTime === "object" && vTime.ms !== undefined) {
                iTotalMs = vTime.ms;
            }
            // Case 2: ISO 8601 duration string like "PT23H19M39S"
            else if (typeof vTime === "string" && vTime.indexOf("PT") === 0) {
                var match = vTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                if (match) {
                    var h = parseInt(match[1] || "0", 10);
                    var m = parseInt(match[2] || "0", 10);
                    var s = parseInt(match[3] || "0", 10);
                    iTotalMs = ((h * 3600) + (m * 60) + s) * 1000;
                } else {
                    return String(vTime);
                }
            }
            // Case 3: Already a number (ms)
            else if (typeof vTime === "number") {
                iTotalMs = vTime;
            }
            else {
                return String(vTime);
            }

            // Convert ms to HH:MM:SS
            var iTotalSeconds = Math.floor(iTotalMs / 1000);
            var iHours   = Math.floor(iTotalSeconds / 3600);
            var iMinutes = Math.floor((iTotalSeconds % 3600) / 60);
            var iSeconds = iTotalSeconds % 60;

            return String(iHours).padStart(2, "0") + ":" +
                   String(iMinutes).padStart(2, "0") + ":" +
                   String(iSeconds).padStart(2, "0");
        }
    };
});
