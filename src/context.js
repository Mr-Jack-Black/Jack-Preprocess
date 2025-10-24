// Note: Adding function call to JackPreprocess() is enough

// === CONTEXT-hook (data sent to AI) ===
const modifier = (text) => {

    // C-style Preprosessing of the context
    text = JackPreprocess(text);

    // Needed to support #ASK and #REFRESH directives
    // which will send questions to AI
    text = JackAskAiQuestion(text);
    
    //return {text, stop};
    return {text};
}
modifier(text);
