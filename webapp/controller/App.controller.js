sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, MessageBox, MessageToast) {
    "use strict";

    // ================================================================
    // IMPORTANT — Paste your Google Cloud API key below.
    //
    // This key is visible in the browser.  It is NOT a secret.
    // Restrict it in Google Cloud Console:
    //   • API restrictions  → Cloud Translation API only
    //   • Application restrictions → HTTP referrers (your domain)
    // ================================================================
    var API_KEY = "AIzaSyBOXv8Izh6iL0qp5nGNaDplVGr-ipoxIcY";

    // Google Cloud Translation API v2 endpoints
    var BASE_URL = "https://translation.googleapis.com/language/translate/v2";
    var LANGUAGES_URL = BASE_URL + "/languages";
    var TRANSLATE_URL = BASE_URL;

    return Controller.extend("datanub.translator.controller.App", {

        /* ──────────────────────────────────────────────
         * Lifecycle
         * ────────────────────────────────────────────── */

        /**
         * Called when the controller is initialised.
         * Sets up the model and loads supported languages from Google.
         */
        onInit: function () {
            // Safer to grab the model from the OwnerComponent to guarantee it's instantly available synchronously
            this._oModel = this.getOwnerComponent().getModel();
            this._oBundle = this.getOwnerComponent()
                .getModel("i18n")
                .getResourceBundle();

            // Load any saved translation state from local storage
            this._loadState();

            // Hook into the browser's unload event to automatically save state upon refresh/close
            window.addEventListener("beforeunload", this._saveState.bind(this));

            // Load the supported language list from the API
            this.loadSupportedLanguages();
        },

        /* ──────────────────────────────────────────────
         * OPERATION 1 — Load Supported Languages
         * ────────────────────────────────────────────── */

        /**
         * Calls GET /language/translate/v2/languages?target=en
         * to retrieve every language Google Cloud Translation supports.
         *
         * The "target=en" parameter tells Google to return the language
         * names localised in English so we get human-readable names.
         */
        loadSupportedLanguages: async function () {
            // Guard: check API key
            if (!API_KEY || API_KEY === "YOUR_GOOGLE_CLOUD_API_KEY") {
                MessageBox.error(this._oBundle.getText("msgApiKeyMissing"));
                return;
            }

            this._oModel.setProperty("/languagesBusy", true);

            try {
                var sUrl = LANGUAGES_URL +
                    "?key=" + encodeURIComponent(API_KEY) +
                    "&target=en";

                var oResponse = await fetch(sUrl, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" }
                });

                if (!oResponse.ok) {
                    await this._handleApiError(oResponse, "languages");
                    return;
                }

                var oData = await oResponse.json();

                // Google returns { data: { languages: [ { language: "af", name: "Afrikaans" }, … ] } }
                var aRawLanguages = oData.data && oData.data.languages;
                if (!Array.isArray(aRawLanguages) || aRawLanguages.length === 0) {
                    MessageBox.error(this._oBundle.getText("msgLanguagesError"));
                    return;
                }

                // Transform into the shape our UI expects: { code, name }
                var aLanguages = aRawLanguages.map(function (oLang) {
                    return {
                        code: oLang.language,
                        name: oLang.name || oLang.language   // fallback to code if name missing
                    };
                });

                // Sort alphabetically by name
                aLanguages.sort(function (a, b) {
                    return a.name.localeCompare(b.name);
                });

                this._oModel.setProperty("/languages", aLanguages);
                MessageToast.show(this._oBundle.getText("msgLanguagesLoaded"));

            } catch (oError) {
                // Network / CORS / unexpected
                MessageBox.error(
                    this._oBundle.getText("msgNetworkError") +
                    "\n\nDetails: " + (oError.message || oError)
                );
            } finally {
                this._oModel.setProperty("/languagesBusy", false);
            }
        },

        /* ──────────────────────────────────────────────
         * OPERATION 2 — Translate Text
         * ────────────────────────────────────────────── */

        /**
         * Event handler for the Translate button.
         * Validates inputs, calls Google Translation API v2,
         * and updates the model with the result.
         */
        onTranslate: async function () {
            var sInputText    = (this._oModel.getProperty("/inputText") || "").trim();
            var sTargetLang   = this._oModel.getProperty("/targetLanguage");

            // ── Validation ──
            if (!sInputText) {
                MessageBox.warning(this._oBundle.getText("msgEnterText"));
                return;
            }
            if (!sTargetLang) {
                MessageBox.warning(this._oBundle.getText("msgSelectLanguage"));
                return;
            }

            this._oModel.setProperty("/busy", true);
            this._oModel.setProperty("/translatedText", "");
            this._oModel.setProperty("/detectedSourceLanguage", "");

            try {
                var sUrl = TRANSLATE_URL + "?key=" + encodeURIComponent(API_KEY);

                var oResponse = await fetch(sUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        q: sInputText,
                        target: sTargetLang,
                        format: "text"
                    })
                });

                if (!oResponse.ok) {
                    await this._handleApiError(oResponse, "translate");
                    return;
                }

                var oData = await oResponse.json();

                // Google returns:
                // { data: { translations: [ { translatedText: "…", detectedSourceLanguage: "en" } ] } }
                var aTranslations = oData.data && oData.data.translations;
                if (!Array.isArray(aTranslations) || aTranslations.length === 0) {
                    MessageBox.error(this._oBundle.getText("msgTranslationError"));
                    return;
                }

                var oTranslation = aTranslations[0];
                this._oModel.setProperty("/translatedText", oTranslation.translatedText);

                // Show detected source language (resolve code → name using the loaded list)
                if (oTranslation.detectedSourceLanguage) {
                    var sDetected = oTranslation.detectedSourceLanguage;
                    var aLangs = this._oModel.getProperty("/languages") || [];
                    var oFound = aLangs.find(function (l) { return l.code === sDetected; });
                    this._oModel.setProperty(
                        "/detectedSourceLanguage",
                        oFound ? oFound.name : sDetected
                    );
                }

                MessageToast.show(this._oBundle.getText("msgTranslationSuccess"));

            } catch (oError) {
                MessageBox.error(
                    this._oBundle.getText("msgNetworkError") +
                    "\n\nDetails: " + (oError.message || oError)
                );
            } finally {
                this._oModel.setProperty("/busy", false);
            }
        },

        /* ──────────────────────────────────────────────
         * Clear
         * ────────────────────────────────────────────── */

        /**
         * Resets all input and output fields.
         */
        onClear: function () {
            this._oModel.setProperty("/inputText", "");
            this._oModel.setProperty("/targetLanguage", "");
            this._oModel.setProperty("/translatedText", "");
            this._oModel.setProperty("/detectedSourceLanguage", "");
        },

        /* ──────────────────────────────────────────────
         * Private helpers
         * ────────────────────────────────────────────── */

        /**
         * Loads saved inputs and outputs from local storage if available.
         */
        _loadState: function () {
            try {
                var sState = localStorage.getItem("LanguageTranslatorState");
                if (sState) {
                    var oState = JSON.parse(sState);
                    this._oModel.setProperty("/inputText", oState.inputText || "");
                    this._oModel.setProperty("/targetLanguage", oState.targetLanguage || "");
                    this._oModel.setProperty("/translatedText", oState.translatedText || "");
                    this._oModel.setProperty("/detectedSourceLanguage", oState.detectedSourceLanguage || "");
                }
            } catch (e) {
                console.error("Could not parse saved UI state.", e);
            }
        },

        /**
         * Saves the current inputs and outputs to local storage.
         */
        _saveState: function () {
            try {
                var oState = {
                    inputText: this._oModel.getProperty("/inputText"),
                    targetLanguage: this._oModel.getProperty("/targetLanguage"),
                    translatedText: this._oModel.getProperty("/translatedText"),
                    detectedSourceLanguage: this._oModel.getProperty("/detectedSourceLanguage")
                };
                localStorage.setItem("LanguageTranslatorState", JSON.stringify(oState));
            } catch (e) {
                console.error("Could not save UI state.", e);
            }
        },

        /**
         * Handles non-OK HTTP responses from the Google API.
         * Maps well-known error codes to user-friendly i18n messages.
         *
         * @param {Response} oResponse - The fetch Response object
         * @param {string}   sContext  - "languages" | "translate"
         */
        _handleApiError: async function (oResponse, sContext) {
            var sMsg;
            try {
                var oErr = await oResponse.json();
                var iCode    = (oErr.error && oErr.error.code) || oResponse.status;
                var sDetail  = (oErr.error && oErr.error.message) || "";

                switch (iCode) {
                    case 400:
                        sMsg = this._oBundle.getText("msgTranslationError") +
                            "\n\n" + sDetail;
                        break;
                    case 401:
                    case 403:
                        // Distinguish "API not enabled" from "bad key"
                        if (sDetail.indexOf("has not been used") > -1 ||
                            sDetail.indexOf("is not enabled") > -1 ||
                            sDetail.indexOf("PERMISSION_DENIED") > -1) {
                            sMsg = this._oBundle.getText("msgApiNotEnabled") +
                                "\n\n" + sDetail;
                        } else {
                            sMsg = this._oBundle.getText("msgApiKeyInvalid") +
                                "\n\n" + sDetail;
                        }
                        break;
                    case 429:
                        sMsg = this._oBundle.getText("msgQuotaExceeded");
                        break;
                    default:
                        sMsg = this._oBundle.getText("msgUnexpectedError", [iCode + " – " + sDetail]);
                }
            } catch (e) {
                sMsg = sContext === "languages"
                    ? this._oBundle.getText("msgLanguagesError")
                    : this._oBundle.getText("msgTranslationError");
            }

            MessageBox.error(sMsg);
        }
    });
});
