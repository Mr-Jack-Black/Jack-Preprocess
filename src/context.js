// Note: Adding function call to JackPreprocess() is enough
// but JackAskAiQuestion is needed for AI questions (#ask/#asking)

// === CONTEXT-hook (data sent to AI) ===
const modifier = (text) => {

    // C-style Preprosessing of the context
    text = JackPreprocess(text);

    // Needed to support #ASK and #REFRESH directives
    // which will send questions to AI
    text = JackAskAiQuestion(text);

    // Optional: Store Context (only used for deep debug)
    state.lastContext = text;
    
    //return {text, stop};
    return {text};
}
modifier(text);
