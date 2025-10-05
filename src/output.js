// NOTE: Adding this file is optional
// - it only includes adding debug output.

// === Adds debug message (if debug enabled) ===
function JackAddDebugInfo(text) {
  if (state.deepDebugMode) {
    text += "\n<SYSTEM>\ninfo.actionCount = " + info.actionCount +
            state.debugOutput +
            "Defines: \n" + JackDumpDefs(state.JackDefsMap) +
            JackAiQuestionsDump() +
            "\nCONTEXT_HOOK:\n" + state.lastContext + "\n</SYSTEM>\n";
  } else if (state.debugMode) {
    text += "\n<SYSTEM>\ninfo.actionCount = " + info.actionCount +
            state.debugOutput +
            "Defines:\n" + JackDumpDefs(state.JackDefsMap) +
            JackAiQuestionsDump() +
            "</SYSTEM>\n";
  }

  return text;
}

// === OUTPUT-hook (data sent to user output) ===
const modifier = (text) => {
  
  // Needed to support #ASK and #REFRESH directives
  text = JackCatchAiAnswer(text);

  // Print debug info if enabled (optional)
  text = JackAddDebugInfo(text);
  
  // Store output
  state.lastOutput = text;

  // For printing out #debug -messages (optional)
  let dbg = JackGetUserDebug();
  if (dbg) {
      text += "\n\n<SYSTEM>\n" + dbg + "\n</SYSTEM>\n";
  }
  
  // Your other output modifier scripts go here (alternative)
  return {text};
};
modifier(text);
