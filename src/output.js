// NOTE: Adding this file is optional
// - it only includes adding debug output.

// === Adds debug message (if debug enabled) ===
function JackAddDebugInfo(text) {
  if (state.deepDebugMode) {
    text += "\n<SYSTEM>\nTurn = " + info.actionCount +
            state.debugOutput +
            "Defines: \n" + JackDumpDefs(state.JackDefsMap) +
            "\nCONTEXT_HOOK:\n" + state.lastContext + "\n</SYSTEM>\n";
  } else if (state.debugMode) {
    text += "\n<SYSTEM>\nTurn = " + info.actionCount +
            state.debugOutput +
            "Defines: \n" + JackDumpDefs(state.JackDefsMap) +
            "\n</SYSTEM>\n";
  }

  return text;
}

// === OUTPUT-hook (data sent to user output) ===
const modifier = (text) => {
  
  // Print debug info if enabled
  text = JackAddDebugInfo(text);
  
  // Store output (not used by Jack)
  state.lastOutput = text;
  
  // Your other output modifier scripts go here (alternative)
  return {text};
};
modifier(text);
