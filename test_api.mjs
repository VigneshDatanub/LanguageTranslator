const API_KEY = "AIzaSyDJV2TD04o63_T5Vm887jQxrSZMQuXpcPs";

async function testTranslate() {
    console.log("=== Testing Google Cloud Translation API ===\n");

    // Test 1: Languages endpoint (GET)
    console.log("Test 1: GET /languages");
    try {
        const langRes = await fetch(
            `https://translation.googleapis.com/language/translate/v2/languages?key=${API_KEY}&target=en`
        );
        console.log("  Status:", langRes.status, langRes.statusText);
        const langData = await langRes.json();
        if (langData.error) {
            console.log("  ERROR:", JSON.stringify(langData.error, null, 2));
        } else {
            const count = langData.data && langData.data.languages ? langData.data.languages.length : 0;
            console.log("  SUCCESS: Got", count, "languages");
        }
    } catch (e) {
        console.log("  NETWORK ERROR:", e.message);
    }

    console.log("");

    // Test 2: Translate endpoint (POST)
    console.log("Test 2: POST /translate (Hello -> Tamil)");
    try {
        const transRes = await fetch(
            `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ q: "Hello", target: "ta", format: "text" })
            }
        );
        console.log("  Status:", transRes.status, transRes.statusText);
        const transData = await transRes.json();
        if (transData.error) {
            console.log("  ERROR:", JSON.stringify(transData.error, null, 2));
        } else {
            console.log("  SUCCESS:", JSON.stringify(transData.data.translations[0]));
        }
    } catch (e) {
        console.log("  NETWORK ERROR:", e.message);
    }
}

testTranslate();
