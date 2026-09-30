sap.ui.define([
    "sap/ui/model/json/JSONModel"
], function (JSONModel) {
    "use strict";

    return {
        /**
         * Creates and returns the application's default JSONModel.
         * This is used as a factory helper; the actual model is also
         * declaratively created in manifest.json.
         *
         * @returns {sap.ui.model.json.JSONModel}
         */
        createAppModel: function () {
            return new JSONModel({
                inputText: "",
                targetLanguage: "",
                translatedText: "",
                detectedSourceLanguage: "",
                languages: [],
                busy: false,
                languagesBusy: false
            });
        }
    };
});
