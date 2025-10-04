// Example of context-file
// Note: Adding JackPreprocess() is enough!

// === Remove debug messages ===
function JackRemoveSystemMsg(text) {
    if (state.debugMode) {
        text = text.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '').trim();
        state.lastOutput = state.lastOutput.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '').trim();
        state.debugOutput = "\nDebugOut: \n";
    } else {
        state.debugOutput = "";
    }
    return text;
}
  
// === CONTEXT-hook (data sent to AI) ===
const modifier = (text) => {
  
    // Remove debug messages (optional)
    text = JackRemoveSystemMsg(text);

    // Just add following line to support JackPreprocess
    // (+ copy everything from library.js to your library-file)
    text = JackPreprocess(text);

    // Store Context (not used by Jack)
    state.lastContext = text;
    
    //return {text, stop};
    return {text};
};
modifier(text);
