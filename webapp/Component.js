sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, Device, JSONModel) {
    "use strict";

    return UIComponent.extend("datanub.translator.Component", {

        metadata: {
            manifest: "json"
        },

        /**
         * Component initialisation.
         * Creates the default JSONModel and applies content-density.
         */
        init: function () {
            console.log("Component.init() called - hiding splash screen");
            var oSplash = document.getElementById("splashScreen");
            if (oSplash) {
                oSplash.style.display = "none";
            }

            // Create the application-wide JSONModel
            var oModel = new JSONModel({
                inputText: "",
                targetLanguage: "",
                translatedText: "",
                detectedSourceLanguage: "",
                languages: [],
                busy: false,
                languagesBusy: false
            });
            oModel.setSizeLimit(500);
            this.setModel(oModel);

            // Call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // Apply content-density class for comfortable / compact display
            this._applyContentDensityClass();
        },

        /**
         * Applies the appropriate content-density CSS class to the body.
         */
        _applyContentDensityClass: function () {
            if (!document.body.classList.contains("sapUiSizeCozy") &&
                !document.body.classList.contains("sapUiSizeCompact")) {
                var sClass = Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
                document.body.classList.add(sClass);
            }
        }
    });
});
