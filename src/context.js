// Note: Adding function calls to JackPreprocess() and JackAskAiQuestion() is enough!
//      (JackRemoveSystemMsg() is needed for debuging.)

// === Remove debug messages ===
function JackRemoveSystemMsg(text) {
    if (state.debugMode) {
        state.lastOutput = state.lastOutput.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '').trim();
        state.debugOutput = "\nDebugOut: \n";
    } else {
        state.debugOutput = "";
    }
    return text.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '');
}
  
// === CONTEXT-hook (data sent to AI) ===
const modifier = (text) => {
  
    // Remove debug messages
    text = JackRemoveSystemMsg(text);

    // C-style Preprosessing of the context
    text = JackPreprocess(text);

    // Needed to support #ASK and #REFRESH directives
    // which will send questions to AI
    text = JackAskAiQuestion(text);

    // Store Context
    state.lastContext = text;
    
    //return {text, stop};
    return {text};
}
modifier(text);
