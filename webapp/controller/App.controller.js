sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment",
    "sap/ui/model/Sorter",
    "datanub/translator/model/formatter"
], function (Controller, MessageBox, MessageToast, Filter, FilterOperator, Fragment, Sorter, formatter) {
    "use strict";

    // ================================================================
    // IMPORTANT — Paste your Google Cloud API key below.
    //
    // This key is visible in the browser.  It is NOT a secret.
    // Restrict it in Google Cloud Console:
    //   • API restrictions  → Cloud Translation API only
    //   • Application restrictions → HTTP referrers (your domain)
    // ================================================================
    var API_KEY = "AIzaSyCqdbPEH1-0IFEhZGAKdY35ZTD3jKYf8s8";

    // Google Cloud Translation API v2 endpoints
    var BASE_URL = "https://translation.googleapis.com/language/translate/v2";
    var LANGUAGES_URL = BASE_URL + "/languages";
    var TRANSLATE_URL = BASE_URL;

    return Controller.extend("datanub.translator.controller.App", {
        formatter: formatter,

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

            this._aCurrentFilters = [];
            this._aSorters = [
                new Sorter("TransOn", true),
                new Sorter("TransAt", true)
            ];

            // Hook into the browser's unload event to automatically save state upon refresh/close
            window.addEventListener("beforeunload", this._saveState.bind(this));

            // Load the supported language list from the API
            this.loadSupportedLanguages();
            
            // Load initial history table page
            this._loadHistoryPage();
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
         *
         * Languages are cached in localStorage for 24 hours to avoid
         * burning API quota on every page load (important for trial accounts).
         */
        loadSupportedLanguages: async function () {
            // Guard: check API key
            if (!API_KEY || API_KEY === "YOUR_GOOGLE_CLOUD_API_KEY") {
                MessageBox.error(this._oBundle.getText("msgApiKeyMissing"));
                return;
            }

            // ── Try to load from cache first ──
            var CACHE_KEY = "LanguageTranslatorLangsCache";
            var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms
            try {
                var sCached = localStorage.getItem(CACHE_KEY);
                if (sCached) {
                    var oCache = JSON.parse(sCached);
                    if (oCache.timestamp && (Date.now() - oCache.timestamp < CACHE_TTL) &&
                        Array.isArray(oCache.languages) && oCache.languages.length > 0) {
                        this._oModel.setProperty("/languages", oCache.languages);
                        MessageToast.show(this._oBundle.getText("msgLanguagesLoaded"));
                        return;  // Cache hit — no API call needed
                    }
                }
            } catch (e) {
                // Cache corrupt — proceed to API call
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

                // ── Save to cache ──
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        languages: aLanguages
                    }));
                } catch (e) { /* storage full — ignore */ }

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
            var sInputText = (this._oModel.getProperty("/inputText") || "").trim();
            var sTargetLang = this._oModel.getProperty("/targetLanguage");

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
                    this._oModel.setProperty("/detectedSourceLanguageCode", sDetected.toUpperCase());
                } else {
                    this._oModel.setProperty("/detectedSourceLanguageCode", "EN");
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
            this._oModel.setProperty("/detectedSourceLanguageCode", "");
            this._sEditGuiNo = null; // Exit edit mode
        },

        /* ──────────────────────────────────────────────
         * OPERATION 3 — SAP OData Integration (History)
         * ────────────────────────────────────────────── */

        onSaveToSAP: function () {
            var sSrcText = this._oModel.getProperty("/inputText");
            var sTarText = this._oModel.getProperty("/translatedText");
            var sTarLang = this._oModel.getProperty("/targetLanguage");
            var sSrcLangCode = this._oModel.getProperty("/detectedSourceLanguageCode") || "EN";
            var sTarLangCode = (sTarLang || "DE").toUpperCase();

            if (!sSrcText || !sTarText) {
                MessageBox.warning("Please translate a text before saving.");
                return;
            }

            var oDataModel = this.getOwnerComponent().getModel("odata");
            var oPayload = {
                SrcLang: sSrcLangCode.substring(0, 40),
                TarLang: sTarLangCode.substring(0, 40),
                SrcText: sSrcText,
                TarText: sTarText
            };

            if (this._sEditGuiNo) {
                var sPath = "/TranlsatedTextsSet(guid'" + this._sEditGuiNo + "')";
                oDataModel.update(sPath, oPayload, {
                    success: function () {
                        MessageToast.show(this._oBundle.getText("msgUpdateSuccess"));
                        this._sEditGuiNo = null; // Exit edit mode
                        this._loadHistoryPage();
                    }.bind(this),
                    error: function (oError) {
                        MessageBox.error(this._oBundle.getText("msgODataError"));
                    }.bind(this)
                });
            } else {
                oDataModel.create("/TranlsatedTextsSet", oPayload, {
                    success: function () {
                        MessageToast.show(this._oBundle.getText("msgSaveSuccess"));
                        this._loadHistoryPage();
                    }.bind(this),
                    error: function (oError) {
                        MessageBox.error(this._oBundle.getText("msgODataError"));
                    }.bind(this)
                });
            }
        },

        onOpenFilterDialog: function () {
            var oView = this.getView();
            if (!this._oFilterDialog) {
                Fragment.load({
                    id: oView.getId(),
                    name: "datanub.translator.view.FilterDialog",
                    controller: this
                }).then(function (oDialog) {
                    this._oFilterDialog = oDialog;
                    oView.addDependent(this._oFilterDialog);
                    this._oFilterDialog.open();
                }.bind(this));
            } else {
                this._oFilterDialog.open();
            }
        },

        onApplyFilterDialog: function () {
            var oView = this.getView();
            var sGuiNo = oView.byId("dlgFilterGuiNo").getValue().trim();
            var sSrcLang = oView.byId("dlgFilterSrcLang").getValue().trim();
            var sTarLang = oView.byId("dlgFilterTarLang").getValue().trim();
            var sCreatedBy = oView.byId("dlgFilterCreatedBy").getValue().trim();
            
            var oDateOn = oView.byId("dlgFilterTransOn").getDateValue();
            var oDateAt = oView.byId("dlgFilterTransAt").getDateValue();

            var aRawFilters = [];
            if (sGuiNo) aRawFilters.push(new Filter("GuiNo", FilterOperator.EQ, sGuiNo));
            if (sSrcLang) aRawFilters.push(new Filter("SrcLang", FilterOperator.EQ, sSrcLang.toUpperCase()));
            if (sTarLang) aRawFilters.push(new Filter("TarLang", FilterOperator.EQ, sTarLang.toUpperCase()));
            if (sCreatedBy) aRawFilters.push(new Filter("TransBy", FilterOperator.EQ, sCreatedBy.toUpperCase()));
            
            if (oDateOn) {
                // To prevent local timezone shifting when UI5 formats it for OData (which uses UTC internally),
                // we construct a strict UTC Date exactly at midnight for the selected local date.
                var oUtcDate = new Date(Date.UTC(oDateOn.getFullYear(), oDateOn.getMonth(), oDateOn.getDate()));
                aRawFilters.push(new Filter("TransOn", FilterOperator.EQ, oUtcDate));
            }
            if (oDateAt) {
                // For Edm.Time, we can construct the object format expected by the model formatter
                var iMs = (oDateAt.getHours() * 3600 + oDateAt.getMinutes() * 60 + oDateAt.getSeconds()) * 1000;
                var oEdmTime = { ms: iMs, __edmType: "Edm.Time" };
                aRawFilters.push(new Filter("TransAt", FilterOperator.EQ, oEdmTime));
            }

            this._aCurrentFilters = [];
            if (aRawFilters.length > 1) {
                this._aCurrentFilters.push(new Filter({ filters: aRawFilters, and: true }));
            } else if (aRawFilters.length === 1) {
                this._aCurrentFilters.push(aRawFilters[0]);
            }

            var oTable = this.getView().byId("historyTable");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.filter(this._aCurrentFilters);
            }
            this._oFilterDialog.close();
        },

        onClearFilterDialog: function () {
            var oView = this.getView();
            oView.byId("dlgFilterGuiNo").setValue("");
            oView.byId("dlgFilterSrcLang").setValue("");
            oView.byId("dlgFilterTarLang").setValue("");
            oView.byId("dlgFilterCreatedBy").setValue("");
            oView.byId("dlgFilterTransOn").setValue("");
            oView.byId("dlgFilterTransAt").setValue("");
            
            this._aCurrentFilters = [];
            var oTable = this.getView().byId("historyTable");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.filter(this._aCurrentFilters);
            }
            this._oFilterDialog.close();
        },

        onCancelFilterDialog: function () {
            this._oFilterDialog.close();
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue");
            var aSearchFilters = [];
            
            if (sQuery && sQuery.length > 0) {
                aSearchFilters = [
                    new Filter({
                        filters: [
                            new Filter("SrcText", FilterOperator.Contains, sQuery),
                            new Filter("TarText", FilterOperator.Contains, sQuery),
                            new Filter("TransBy", FilterOperator.Contains, sQuery),
                            new Filter("SrcLang", FilterOperator.Contains, sQuery),
                            new Filter("TarLang", FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ];
            }

            // Combine with existing dialog filters
            var aFinalFilters = this._aCurrentFilters.slice(); 
            if (aSearchFilters.length > 0) {
                aFinalFilters.push(aSearchFilters[0]);
            }

            var oTable = this.getView().byId("historyTable");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.filter(aFinalFilters);
            }
        },

        onExport: function () {
            var oTable = this.getView().byId("historyTable");
            var oBinding = oTable.getBinding("items");
            if (!oBinding) {
                return;
            }

            var aContexts = oBinding.getContexts(0, oBinding.getLength());
            var aData = aContexts.map(function (oContext) {
                return oContext.getObject();
            });

            if (aData.length === 0) {
                MessageBox.warning("No data to export.");
                return;
            }

            var sCsv = "\uFEFFID (GuiNo),Source Text,Target Text,Source Lang,Target Lang,Created By,Date,Time\n";
            aData.forEach(function (oRow) {
                var sDate = oRow.TransOn ? new Date(oRow.TransOn).toLocaleDateString() : "";
                var sTime = oRow.TransAt && oRow.TransAt.ms !== undefined ? 
                            new Date(oRow.TransAt.ms).toISOString().substr(11,8) : "";
                
                var escapeCsv = function(s) {
                    if (s === null || s === undefined) return '""';
                    return '"' + String(s).replace(/"/g, '""') + '"';
                };

                sCsv += escapeCsv(oRow.GuiNo) + "," +
                        escapeCsv(oRow.SrcText) + "," +
                        escapeCsv(oRow.TarText) + "," +
                        escapeCsv(oRow.SrcLang) + "," +
                        escapeCsv(oRow.TarLang) + "," +
                        escapeCsv(oRow.TransBy) + "," +
                        escapeCsv(sDate) + "," +
                        escapeCsv(sTime) + "\n";
            });

            sap.ui.require(["sap/ui/core/util/File"], function (File) {
                File.save(sCsv, "TranslationHistory", "csv", "text/csv");
            });
        },

        onOpenSortDialog: function () {
            var oView = this.getView();
            if (!this._oSortDialog) {
                Fragment.load({
                    id: oView.getId(),
                    name: "datanub.translator.view.SortDialog",
                    controller: this
                }).then(function (oDialog) {
                    this._oSortDialog = oDialog;
                    oView.addDependent(this._oSortDialog);
                    this._oSortDialog.open();
                }.bind(this));
            } else {
                this._oSortDialog.open();
            }
        },

        onConfirmSortDialog: function (oEvent) {
            var mParams = oEvent.getParameters();
            var oSortItem = mParams.sortItem;
            var bDescending = mParams.sortDescending;

            if (oSortItem) {
                var sPath = oSortItem.getKey();
                this._aSorters = [new Sorter(sPath, bDescending)];
                if (sPath === "TransOn") {
                    this._aSorters.push(new Sorter("TransAt", bDescending));
                }
            } else {
                this._aSorters = [
                    new Sorter("TransOn", true),
                    new Sorter("TransAt", true)
                ];
            }

            var oTable = this.getView().byId("historyTable");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.sort(this._aSorters);
            }
        },

        onRefreshHistory: function () {
            this._loadHistoryPage();
        },

        onDeleteHistory: function (oEvent) {
            var oData = oEvent.getSource().getBindingContext().getObject();
            var sPath = "/TranlsatedTextsSet(guid'" + oData.GuiNo + "')";
            var oDataModel = this.getOwnerComponent().getModel("odata");

            MessageBox.confirm(this._oBundle.getText("msgDeleteConfirm"), {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oDataModel.remove(sPath, {
                            success: function () {
                                MessageToast.show(this._oBundle.getText("msgDeleteSuccess"));
                                this._loadHistoryPage();
                            }.bind(this),
                            error: function () {
                                MessageBox.error(this._oBundle.getText("msgODataError"));
                            }.bind(this)
                        });
                    }
                }.bind(this)
            });
        },

        onEditHistory: function (oEvent) {
            var oData = oEvent.getSource().getBindingContext().getObject();
            
            // Set the main UI model values to the selected record
            this._oModel.setProperty("/inputText", oData.SrcText);
            this._oModel.setProperty("/targetLanguage", (oData.TarLang || "").toLowerCase());
            this._oModel.setProperty("/translatedText", oData.TarText);
            this._oModel.setProperty("/detectedSourceLanguageCode", (oData.SrcLang || "").toLowerCase());
            
            // Store the GuiNo so onSaveToSAP knows to update instead of create
            this._sEditGuiNo = oData.GuiNo;

            // Scroll to the top of the page so the user sees the input box
            var oPage = this.getView().byId("page");
            if (oPage) { oPage.scrollTo(0); }
            
            MessageToast.show("Loaded translation for editing. Make your changes and click Translate.");
        },

        _loadHistoryPage: function () {
            var oDataModel = this.getOwnerComponent().getModel("odata");
            var oTable = this.getView().byId("historyTable");
            oTable.setBusy(true);

            oDataModel.read("/TranlsatedTextsSet", {
                urlParameters: { "$top": "5000" },
                success: function (oData) {
                    oTable.setBusy(false);
                    var aResults = oData.results || [];
                    this._oModel.setProperty("/allHistoryData", aResults);
                    
                    // Apply current filters and sorters locally on the ListBinding
                    var oBinding = oTable.getBinding("items");
                    if (oBinding) {
                        oBinding.filter(this._aCurrentFilters);
                        oBinding.sort(this._aSorters);
                    }
                }.bind(this),
                error: function () {
                    oTable.setBusy(false);
                    MessageBox.error("Failed to load history.");
                }.bind(this)
            });
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
                var iCode = (oErr.error && oErr.error.code) || oResponse.status;
                var sDetail = (oErr.error && oErr.error.message) || "";

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
