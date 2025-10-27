// Note: Adding function call to JackPreprocess() is enough
// but JackAskAiQuestion is needed for AI questions (#ask/#asking)

// === CONTEXT-hook (data sent to AI) ===
const modifier = (text) => {
    stop = false; // Ai Processing needed always by default.

    // C-style Preprosessing of the context
    text = JackPreprocessor(text);

    // Needed to support #ASK and #REFRESH directives
    // which will send questions to AI.
    text = JackAskAiQuestion(text);
/*
    // Do not execute Auto-Cards if there is AI question.
    if (!JackThereIsActiveAiQuestion()) {
        // LewdLeah Auto-Cards
        [text, stop] = AutoCards("context", text, stop);
    }
*/
    // Optional: Log Context that was output
    if (state.verboseLevel >= LOG_CONTEXT) {
        state.debugOutput += "\n\nCONTEXT_OUT:\n============\n" + text + "\n============\n";
    }
    
    //return {text};
    return {text, stop};
}
modifier(text);
